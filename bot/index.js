import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import https from "https";
import { execFile } from "child_process";
import { tmpdir } from "os";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LINKS_FILE         = join(__dirname, "links.json");
const CONFIG_FILE        = join(__dirname, "live-config.json");
const TOKENS_FILE        = join(__dirname, "../tokens.json");
const BETA_FEATURES_FILE = join(__dirname, "../beta-features.json");
const FREEDNS_FILE       = join(__dirname, "../freedns-domains.txt");
const FINDLINK_USAGE_FILE = join(__dirname, "../findlink-usage.json");
const FINDLINK_CACHE_FILE = join(__dirname, "../findlink-cache.json");

// ── /findlink domain result cache ───────────────────────────────────────────
function loadFindlinkCache() {
  if (!existsSync(FINDLINK_CACHE_FILE)) return {};
  return JSON.parse(readFileSync(FINDLINK_CACHE_FILE, "utf-8"));
}

function saveFindlinkCache(cache) {
  writeFileSync(FINDLINK_CACHE_FILE, JSON.stringify(cache));
}

// Returns cached results array for a domain this month, or null if not cached
function getCachedResults(domain) {
  const cache = loadFindlinkCache();
  const month = new Date().toISOString().slice(0, 7);
  return cache[`${month}:${domain}`] ?? null;
}

// Stores all filter results for a domain this month
function setCachedResults(domain, results) {
  const cache = loadFindlinkCache();
  const month = new Date().toISOString().slice(0, 7);
  // Evict entries from previous months to keep the file small
  for (const key of Object.keys(cache)) {
    if (!key.startsWith(month + ":")) delete cache[key];
  }
  cache[`${month}:${domain}`] = results;
  saveFindlinkCache(cache);
}

// ── /findlink usage tracking ────────────────────────────────────────────────
function loadFindlinkUsage() {
  if (!existsSync(FINDLINK_USAGE_FILE)) return {};
  return JSON.parse(readFileSync(FINDLINK_USAGE_FILE, "utf-8"));
}

function saveFindlinkUsage(data) {
  writeFileSync(FINDLINK_USAGE_FILE, JSON.stringify(data, null, 2));
}

function getFindlinkUses(userId) {
  const data = loadFindlinkUsage();
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  return data[userId]?.[month] ?? 0;
}

function incrementFindlinkUses(userId) {
  const data = loadFindlinkUsage();
  const month = new Date().toISOString().slice(0, 7);
  if (!data[userId]) data[userId] = {};
  data[userId][month] = (data[userId][month] ?? 0) + 1;
  saveFindlinkUsage(data);
  return data[userId][month];
}

// ── Persistent config (live message IDs) ──────────────────────────────────
function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

function saveConfig(cfg) {
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ── Ambassador token storage ────────────────────────────────────────────────
function loadTokens() {
  if (!existsSync(TOKENS_FILE)) return [];
  return JSON.parse(readFileSync(TOKENS_FILE, "utf-8"));
}

function saveTokens(tokens) {
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// ── Beta feature storage ────────────────────────────────────────────────────
function loadBetaFeatures() {
  if (!existsSync(BETA_FEATURES_FILE)) return [];
  return JSON.parse(readFileSync(BETA_FEATURES_FILE, "utf-8"));
}

function saveBetaFeatures(features) {
  writeFileSync(BETA_FEATURES_FILE, JSON.stringify(features, null, 2));
}

// ── Link storage ───────────────────────────────────────────────────────────
function loadLinks() {
  if (!existsSync(LINKS_FILE)) return [];
  return JSON.parse(readFileSync(LINKS_FILE, "utf-8"));
}

function saveLinks(links) {
  writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2));
}

// ── Server status check ────────────────────────────────────────────────────
function checkStatus(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    https
      .get(url, (res) => {
        res.resume();
        resolve({ online: true, code: res.statusCode, ms: Date.now() - start });
      })
      .on("error", () => {
        resolve({ online: false, ms: Date.now() - start });
      });
  });
}

// ── Client setup ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const {
  DISCORD_TOKEN,
  MEMBER_ROLE_ID,
  WELCOME_CHANNEL_ID,
  ANNOUNCEMENTS_CHANNEL_ID,
  VERIFIED_ROLE_ID,
  BOT_COMMANDS_CHANNEL_ID,
  MOD_LOG_CHANNEL_ID,
  TICKETS_CHANNEL_ID,
  STAFF_ROLE_ID,
  SERVER_URL = "https://veilub.mooo.com",
} = process.env;

// Public commands that must be used in #bot-commands
const PUBLIC_COMMANDS = new Set([
  "links", "status", "faq", "serverinfo", "uptime",
  "leaderboard", "beta-status", "freedns", "findlink",
]);

// Send a log embed to #mod-log
async function modLog(guild, embed) {
  if (!MOD_LOG_CHANNEL_ID) return;
  try {
    const ch = guild.channels.cache.get(MOD_LOG_CHANNEL_ID);
    if (ch) await ch.send({ embeds: [embed] });
  } catch { /* ignore */ }
}

const BOT_START = Date.now();

// ── Live embed builders ────────────────────────────────────────────────────
async function buildStatusEmbed(guild) {
  const result = await checkStatus(SERVER_URL);
  await guild.members.fetch();
  const online = guild.members.cache.filter(
    (m) => m.presence?.status && m.presence.status !== "offline"
  ).size;
  return new EmbedBuilder()
    .setColor(result.online ? 0x22c55e : 0xef4444)
    .setTitle("🌐 Veil Live Status")
    .addFields(
      { name: "Proxy",    value: result.online ? "🟢 Online" : "🔴 Offline", inline: true },
      { name: "Ping",     value: `${result.ms}ms`,                            inline: true },
      { name: "Members",  value: `${guild.memberCount}`,                      inline: true },
      { name: "Online",   value: `${online}`,                                 inline: true },
      { name: "Links",    value: `${loadLinks().length} active`,               inline: true },
    )
    .setFooter({ text: `Last updated` })
    .setTimestamp();
}

function buildLinksEmbed() {
  const links = loadLinks();
  let description;
  if (!links.length) {
    description = "No links yet. Staff can add one with `/addlink`.";
  } else {
    description = links.map((l, i) => {
      let line = `**${i + 1}. [${l.name || l.url}](${l.url})**`;
      if (l.unblocked && l.unblocked.length) {
        line += `\n✅ Works on: ${l.unblocked.join(" · ")}`;
      }
      if (l.submittedBy) {
        line += `\n👤 Submitted by ${l.submittedBy}`;
      }
      return line;
    }).join("\n\n");
  }
  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle("🔗 Working Veil Links")
    .setDescription(description)
    .setFooter({ text: "First load may take a few seconds for the SSL cert" })
    .setTimestamp();
}

// ── Update live messages ───────────────────────────────────────────────────
async function refreshLiveMessages() {
  const cfg = loadConfig();
  if (cfg.statusChannelId && cfg.statusMessageId) {
    try {
      const ch  = await client.channels.fetch(cfg.statusChannelId);
      const msg = await ch.messages.fetch(cfg.statusMessageId);
      await msg.edit({ embeds: [await buildStatusEmbed(ch.guild)] });
    } catch { /* message deleted or channel gone */ }
  }
  if (cfg.linksChannelId && cfg.linksMessageId) {
    try {
      const ch  = await client.channels.fetch(cfg.linksChannelId);
      const msg = await ch.messages.fetch(cfg.linksMessageId);
      await msg.edit({ embeds: [buildLinksEmbed()] });
    } catch { /* message deleted or channel gone */ }
  }
}

// ── AI Server Monitor ────────────────────────────────────────────────────────

const AI_ALERT_CHANNEL_ID = process.env.AI_ALERT_CHANNEL_ID;
const AI_INTERVAL_MINUTES = parseInt(process.env.AI_INTERVAL_MINUTES ?? "30");
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Ring buffer of last 300 messages
const msgBuffer = [];

client.on(Events.MessageCreate, (message) => {
  if (message.author.bot || !message.guild) return;
  msgBuffer.push({
    channel: message.channel.name ?? "unknown",
    author:  message.author.username,
    content: message.content.slice(0, 500),
    ts:      new Date().toLocaleTimeString(),
  });
  if (msgBuffer.length > 300) msgBuffer.shift();
});

async function runAiScan(guild) {
  if (!openai || !AI_ALERT_CHANNEL_ID) return;
  if (msgBuffer.length < 3) return;

  const transcript = msgBuffer.slice(-150).map(
    (m) => `[#${m.channel}] ${m.author}: ${m.content}`
  ).join("\n");

  let alerts;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a Discord server monitor for a school proxy service called Veil. Analyze recent server messages and identify things the server owner should act on. Be selective — only surface genuine issues, not normal chat. Return ONLY a valid JSON object with key "alerts" containing an array. Each item: { "priority": "low"|"medium"|"high"|"urgent", "category": "unanswered_question"|"conflict"|"spam"|"feedback"|"bug_report"|"moderation_needed"|"other", "summary": "brief description", "channel": "#channel-name", "action": "recommended action" }. Return {"alerts":[]} if nothing needs attention.`,
        },
        {
          role: "user",
          content: `Server: ${guild.name}\n\nRecent messages:\n${transcript}\n\nWhat needs attention?`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
  } catch (err) {
    console.error("[AI Monitor] Error:", err.message);
    return;
  }

  if (!alerts.length) {
    console.log("[AI Monitor] Scan complete — nothing flagged.");
    return;
  }

  const alertChannel = guild.channels.cache.get(AI_ALERT_CHANNEL_ID);
  if (!alertChannel) return;

  const PRIORITY_COLOR = { low: 0x6366f1, medium: 0xf59e0b, high: 0xf97316, urgent: 0xef4444 };
  const PRIORITY_ICON  = { low: "🔵", medium: "🟡", high: "🟠", urgent: "🔴" };
  const CAT_LABEL = {
    unanswered_question: "❓ Unanswered Question",
    conflict:            "⚔️ Conflict",
    spam:                "🚫 Spam",
    feedback:            "💬 Feedback",
    bug_report:          "🐛 Bug Report",
    moderation_needed:   "🔨 Moderation Needed",
    other:               "📌 Other",
  };

  const order = { urgent: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));

  const embed = new EmbedBuilder()
    .setColor(PRIORITY_COLOR[alerts[0].priority] ?? 0x6366f1)
    .setTitle("🤖 AI Monitor — Things to Check")
    .setDescription(`Found **${alerts.length}** item${alerts.length > 1 ? "s" : ""} from the last ${msgBuffer.length} messages.`)
    .setTimestamp();

  for (const alert of alerts.slice(0, 5)) {
    embed.addFields({
      name:  `${PRIORITY_ICON[alert.priority] ?? "•"} ${CAT_LABEL[alert.category] ?? alert.category} — ${alert.channel}`,
      value: `**${alert.summary}**\n> ${alert.action}`,
    });
  }

  embed.setFooter({ text: `Powered by Claude AI · runs every ${AI_INTERVAL_MINUTES}m` });
  await alertChannel.send({ embeds: [embed] }).catch(console.error);
}

// ────────────────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, () => {
  console.log(`Veil Bot ready as ${client.user.tag}`);
  // Refresh live embeds every 60 seconds
  setInterval(refreshLiveMessages, 60_000);
  // Start AI monitor if configured
  if (openai && AI_ALERT_CHANNEL_ID) {
    setInterval(() => {
      client.guilds.cache.forEach((guild) => runAiScan(guild));
    }, AI_INTERVAL_MINUTES * 60 * 1000);
    console.log(`[AI Monitor] Active — scanning every ${AI_INTERVAL_MINUTES}m`);
  }
});

// ── Auto-role + welcome on join ────────────────────────────────────────────
client.on(Events.GuildMemberAdd, async (member) => {
  if (MEMBER_ROLE_ID) {
    const role = member.guild.roles.cache.get(MEMBER_ROLE_ID);
    if (role) await member.roles.add(role).catch(console.error);
  }

  if (WELCOME_CHANNEL_ID) {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0x6366f1)
        .setTitle(`Welcome to Veil, ${member.user.username}!`)
        .setDescription(
          `You're in. Here's how to get started:\n\n` +
          `**1.** Head to <#${process.env.VERIFY_CHANNEL_ID || "verify"}> and click **Verify Me** to unlock the server\n` +
          `**2.** Grab a working proxy link from **#links**\n` +
          `**3.** Check **#faq** if something isn't working\n` +
          `**4.** Use **#bot-commands** for bot features like \`/findlink\` and \`/freedns\`\n\n` +
          `Want exclusive themes and early access? Check out the **Ambassador Program** — use \`/faq\` and pick *Ambassador program* for details.`
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({ text: `Member #${member.guild.memberCount}` })
        .setTimestamp();
      channel.send({ embeds: [embed] });
    }
  }
});

// ── Verification captcha store (in-memory, userId -> { answer, expiresAt }) ─
const pendingVerify = new Map();

// ── Button interactions ────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "close_ticket") {
    if (!interaction.channel.isThread()) {
      return interaction.reply({ content: "This can only be used inside a ticket thread.", ephemeral: true });
    }
    try {
      await interaction.reply({ content: "🔒 Closing ticket..." });
      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("Ticket Closed")
        .addFields(
          { name: "Thread", value: interaction.channel.name, inline: true },
          { name: "Closed by", value: `${interaction.user.tag}`, inline: true },
        )
        .setTimestamp());
      await interaction.channel.setLocked(true);
      await interaction.channel.setArchived(true);
    } catch (err) {
      return interaction.followUp({ content: `Error closing ticket: ${err.message}`, ephemeral: true });
    }
    return;
  }

  if (interaction.customId === "open_ticket") {
    const modal = new ModalBuilder()
      .setCustomId("ticket_modal")
      .setTitle("Open a Support Ticket");

    const issueInput = new TextInputBuilder()
      .setCustomId("ticket_issue")
      .setLabel("Describe your issue")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(1000)
      .setPlaceholder("e.g. The proxy isn't loading YouTube, I get a service worker error...");

    modal.addComponents(new ActionRowBuilder().addComponents(issueInput));
    return interaction.showModal(modal);
  }

  if (interaction.customId === "verify_user") {
    if (!VERIFIED_ROLE_ID) {
      return interaction.reply({ content: "VERIFIED_ROLE_ID is not set in the bot .env file.", ephemeral: true });
    }
    if (interaction.member.roles.cache.has(VERIFIED_ROLE_ID)) {
      return interaction.reply({ content: "You are already verified!", ephemeral: true });
    }

    // Generate a simple random math question
    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    const answer = String(a + b);
    pendingVerify.set(interaction.user.id, { answer, expiresAt: Date.now() + 5 * 60 * 1000 });

    const modal = new ModalBuilder()
      .setCustomId("verify_modal")
      .setTitle("Veil Verification");

    const captchaInput = new TextInputBuilder()
      .setCustomId("captcha_answer")
      .setLabel(`What is ${a} + ${b}? (type the number)`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(4)
      .setPlaceholder("Type your answer here");

    const agreeInput = new TextInputBuilder()
      .setCustomId("rules_agree")
      .setLabel('Type "I agree" to accept the rules')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(7)
      .setMaxLength(7)
      .setPlaceholder("I agree");

    modal.addComponents(
      new ActionRowBuilder().addComponents(captchaInput),
      new ActionRowBuilder().addComponents(agreeInput),
    );

    return interaction.showModal(modal);
  }
});

// ── Modal submissions ──────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  if (interaction.customId === "ticket_modal") {
    const issue = interaction.fields.getTextInputValue("ticket_issue");
    const ticketsChannel = TICKETS_CHANNEL_ID
      ? interaction.guild.channels.cache.get(TICKETS_CHANNEL_ID)
      : null;

    if (!ticketsChannel) {
      return interaction.reply({ content: "Tickets are not configured. Please contact staff.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const thread = await ticketsChannel.threads.create({
        name: `ticket-${interaction.user.username}`,
        autoArchiveDuration: 1440,
        type: ChannelType.PublicThread,
        reason: `Support ticket from ${interaction.user.tag}`,
      });

      await thread.members.add(interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor(0x6366f1)
        .setTitle("Support Ticket")
        .addFields(
          { name: "User",  value: `${interaction.user} (${interaction.user.tag})`, inline: true },
          { name: "Issue", value: issue },
        )
        .setFooter({ text: `Thread ID: ${thread.id}` })
        .setTimestamp();

      const closeButton = new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒");

      await thread.send({
        content: `${interaction.user}${STAFF_ROLE_ID ? ` | <@&${STAFF_ROLE_ID}>` : " | @Staff"}`,
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(closeButton)],
      });

      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(0x6366f1)
        .setTitle("Ticket Opened")
        .addFields(
          { name: "User",   value: `${interaction.user.tag}`, inline: true },
          { name: "Thread", value: `<#${thread.id}>`,         inline: true },
          { name: "Issue",  value: issue },
        )
        .setTimestamp());

      return interaction.editReply({
        content: `Your ticket has been created: <#${thread.id}>. Staff will be with you shortly.`,
      });
    } catch (err) {
      return interaction.editReply({ content: `Error creating ticket: ${err.message}` });
    }
  }

  if (interaction.customId === "verify_modal") {
    const captchaAnswer = interaction.fields.getTextInputValue("captcha_answer").trim();
    const rulesAgree   = interaction.fields.getTextInputValue("rules_agree").trim().toLowerCase();

    const pending = pendingVerify.get(interaction.user.id);

    if (!pending || Date.now() > pending.expiresAt) {
      pendingVerify.delete(interaction.user.id);
      return interaction.reply({ content: "Your verification session expired. Click the button again to restart.", ephemeral: true });
    }

    if (rulesAgree !== "i agree") {
      return interaction.reply({ content: 'You must type exactly **"I agree"** to accept the rules.', ephemeral: true });
    }

    if (captchaAnswer !== pending.answer) {
      pendingVerify.delete(interaction.user.id);
      return interaction.reply({ content: "Incorrect answer. Click the Verify button again to try a new question.", ephemeral: true });
    }

    pendingVerify.delete(interaction.user.id);

    try {
      await interaction.member.roles.add(VERIFIED_ROLE_ID);
      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("User Verified (captcha)")
        .addFields({ name: "User", value: `${interaction.user.tag} (${interaction.user.id})` })
        .setTimestamp());
      return interaction.reply({ content: "✅ You're verified! Welcome to Veil.", ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
  }
});

// ── Slash commands ─────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  // Restrict public commands to #bot-commands
  if (PUBLIC_COMMANDS.has(commandName) && BOT_COMMANDS_CHANNEL_ID && interaction.channel.id !== BOT_COMMANDS_CHANNEL_ID) {
    return interaction.reply({
      content: `Please use bot commands in <#${BOT_COMMANDS_CHANNEL_ID}>.`,
      ephemeral: true,
    });
  }

  // /links
  if (commandName === "links") {
    return interaction.reply({ embeds: [buildLinksEmbed()] });
  }

  // /addlink
  if (commandName === "addlink") {
    const url       = interaction.options.getString("url");
    const name      = interaction.options.getString("name") || new URL(url).hostname;
    const submitter = interaction.options.getUser("submitter");
    const unblocked = interaction.options.getString("unblocked");
    const links = loadLinks();
    if (links.find((l) => l.url === url)) {
      return interaction.reply({ content: "That link is already in the list.", ephemeral: true });
    }
    const entry = { url, name, addedAt: new Date().toISOString() };
    if (submitter) {
      entry.submittedBy   = submitter.username;
      entry.submittedById = submitter.id;
    }
    if (unblocked) {
      entry.unblocked = unblocked.split(",").map((s) => s.trim()).filter(Boolean);
    }
    links.push(entry);
    saveLinks(links);
    refreshLiveMessages();
    return interaction.reply({ content: `Added **${name}** to the links list.` });
  }

  // /updatelink
  if (commandName === "updatelink") {
    const url       = interaction.options.getString("url");
    const name      = interaction.options.getString("name");
    const submitter = interaction.options.getUser("submitter");
    const unblocked = interaction.options.getString("unblocked");
    const links = loadLinks();
    const entry = links.find((l) => l.url === url);
    if (!entry) {
      return interaction.reply({ content: "Link not found.", ephemeral: true });
    }
    if (name)      entry.name = name;
    if (submitter) { entry.submittedBy = submitter.username; entry.submittedById = submitter.id; }
    if (unblocked !== null) {
      entry.unblocked = unblocked.split(",").map((s) => s.trim()).filter(Boolean);
    }
    saveLinks(links);
    refreshLiveMessages();
    return interaction.reply({ content: `Updated **${entry.name}**.`, ephemeral: true });
  }

  // /removelink
  if (commandName === "removelink") {
    const url = interaction.options.getString("url");
    const links = loadLinks();
    const filtered = links.filter((l) => l.url !== url);
    if (filtered.length === links.length) {
      return interaction.reply({ content: "Link not found.", ephemeral: true });
    }
    saveLinks(filtered);
    refreshLiveMessages();
    return interaction.reply({ content: `Removed **${url}** from the links list.` });
  }

  // /status
  if (commandName === "status") {
    await interaction.deferReply();
    const result = await checkStatus(SERVER_URL);
    const embed = new EmbedBuilder()
      .setTitle("Veil Server Status")
      .setColor(result.online ? 0x22c55e : 0xef4444)
      .addFields(
        { name: "Status",   value: result.online ? "🟢 Online" : "🔴 Offline", inline: true },
        { name: "Ping",     value: `${result.ms}ms`,                           inline: true },
        { name: "Checked",  value: SERVER_URL,                                 inline: false }
      );
    return interaction.editReply({ embeds: [embed] });
  }

  // /faq
  if (commandName === "faq") {
    const topic = interaction.options.getString("topic");
    const faqs = {
      error:
        "**Scramjet / Service Worker Error**\n" +
        "This usually means one of two things:\n" +
        "• You're on `http://` instead of `https://` — make sure your link starts with `https://`\n" +
        "• The service worker failed to install — try opening the link in a new tab, or clear your browser cache and reload\n" +
        "If it keeps happening, the link may have been blocked. Check #links for a working one.",
      slow:
        "**Site is Slow**\n" +
        "A few things that help:\n" +
        "• Try a different link from #links — some routes are faster than others\n" +
        "• Avoid peak hours (typically 7am–4pm on school days)\n" +
        "• Close other tabs — the proxy uses your browser's resources\n" +
        "• If a game is lagging, it may just be the game's own servers",
      blocked:
        "**Site Won't Load / Keeps Getting Blocked**\n" +
        "• If the link itself is blocked at school, get a new one from #links or use `/findlink` to find one that passes your filter\n" +
        "• Some sites (Netflix, Spotify, etc.) actively detect and block proxies — this is a limitation we can't fix\n" +
        "• If you get a school block page, your filter caught the domain — try a different link\n" +
        "• Tab cloak (Settings → Appearance) can help avoid teacher attention",
      link:
        "**Make Your Own Veil Link**\n" +
        "1. Go to [freedns.afraid.org](https://freedns.afraid.org) → create a free account\n" +
        "2. Click **Subdomains** → **Add**\n" +
        "3. Set Type: `A` | Enter any subdomain name | Pick a domain | Destination: your server IP (see #links for the current IP)\n" +
        "4. Save — wait ~2 minutes for it to go live\n" +
        "5. Visit `https://yoursubdomain.domain.com`\n\n" +
        "Tip: Use `/freedns` to get random domain suggestions, or `/findlink` to find one already unblocked by your school filter.",
      history:
        "**History & Privacy**\n" +
        "• Your browsing history is stored **only on your own device** in local storage — nothing is sent to our servers\n" +
        "• We do not log what sites you visit through the proxy\n" +
        "• You can clear or disable history in **Settings → Privacy**\n" +
        "• Tab cloak titles are also stored locally only",
      ambassador:
        "**Ambassador Program**\n" +
        "Advertise Veil in a Discord server with 50+ members, screenshot it, and DM proof to staff.\n" +
        "You'll get an **ambassador token** that unlocks:\n" +
        "• Exclusive themes (Aura, Crimson, Gold)\n" +
        "• Premium tab cloaks (YouTube, Spotify, Roblox, Discord)\n" +
        "• Early access to new features before public release\n" +
        "• Ambassador leaderboard rank\n" +
        "• Access to `/findlink` — finds unblocked domains for your school filter",
    };

    const embed = new EmbedBuilder().setColor(0x6366f1).setTitle("FAQ");

    if (topic && faqs[topic]) {
      embed.setDescription(faqs[topic]);
    } else {
      embed.setDescription(Object.values(faqs).join("\n\n"));
    }

    return interaction.reply({ embeds: [embed] });
  }

  // /serverinfo
  if (commandName === "serverinfo") {
    await interaction.deferReply();
    const guild = interaction.guild;
    await guild.members.fetch();
    const totalMembers = guild.memberCount;
    const onlineMembers = guild.members.cache.filter(
      (m) => m.presence?.status && m.presence.status !== "offline"
    ).size;
    const result = await checkStatus(SERVER_URL);
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("Veil Server Info")
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: "👥 Members",       value: `${totalMembers}`,                              inline: true },
        { name: "🟢 Online",        value: `${onlineMembers}`,                             inline: true },
        { name: "📅 Created",       value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: "🌐 Proxy Status",  value: result.online ? "🟢 Online" : "🔴 Offline",    inline: true },
        { name: "⚡ Ping",          value: `${result.ms}ms`,                               inline: true },
        { name: "🔗 Links",         value: `${loadLinks().length} active`,                 inline: true }
      )
      .setFooter({ text: SERVER_URL });
    return interaction.editReply({ embeds: [embed] });
  }

  // /announce
  if (commandName === "announce") {
    const message = interaction.options.getString("message");
    const channelId = ANNOUNCEMENTS_CHANNEL_ID;
    if (!channelId) {
      return interaction.reply({ content: "ANNOUNCEMENTS_CHANNEL_ID is not set in the bot .env file.", ephemeral: true });
    }
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) {
      return interaction.reply({ content: "Announcements channel not found.", ephemeral: true });
    }
    const ping = interaction.options.getBoolean("ping") ?? true;
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("📣 Veil Update")
      .setDescription(message)
      .setTimestamp()
      .setFooter({ text: `Posted by ${interaction.user.username}` });
    await channel.send({ content: ping ? "@everyone" : undefined, embeds: [embed] });
    return interaction.reply({ content: `Announcement posted!${ping ? " (@everyone pinged)" : " (no ping)"}`, ephemeral: true });
  }

  // /testwelcome
  if (commandName === "testwelcome") {
    const channel = WELCOME_CHANNEL_ID
      ? interaction.guild.channels.cache.get(WELCOME_CHANNEL_ID)
      : null;
    if (!channel) {
      return interaction.reply({ content: "WELCOME_CHANNEL_ID is not set or channel not found.", ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle(`Welcome to Veil, ${interaction.user.username}!`)
      .setDescription(
        `You're in. Here's how to get started:\n\n` +
        `**1.** Head to <#${process.env.VERIFY_CHANNEL_ID || "verify"}> and click **Verify Me** to unlock the server\n` +
        `**2.** Grab a working proxy link from **#links**\n` +
        `**3.** Check **#faq** if something isn't working\n` +
        `**4.** Use **#bot-commands** for bot features like \`/findlink\` and \`/freedns\`\n\n` +
        `Want exclusive themes and early access? Check out the **Ambassador Program** — use \`/faq\` and pick *Ambassador program* for details.`
      )
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: `Member #${interaction.guild.memberCount} · Test message` })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
    return interaction.reply({ content: "Test welcome message sent!", ephemeral: true });
  }

  // /livestatus
  if (commandName === "livestatus") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const embed = await buildStatusEmbed(interaction.guild);
      const msg = await interaction.channel.send({ embeds: [embed] });
      const cfg = loadConfig();
      cfg.statusChannelId = interaction.channel.id;
      cfg.statusMessageId = msg.id;
      saveConfig(cfg);
      return interaction.editReply({ content: "Live status embed posted! It will update every 60 seconds." });
    } catch (err) {
      console.error(err);
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }

  // /livelinks
  if (commandName === "livelinks") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const msg = await interaction.channel.send({ embeds: [buildLinksEmbed()] });
      const cfg = loadConfig();
      cfg.linksChannelId = interaction.channel.id;
      cfg.linksMessageId = msg.id;
      saveConfig(cfg);
      return interaction.editReply({ content: "Live links embed posted! It will update automatically when links are added or removed." });
    } catch (err) {
      console.error(err);
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }

  // /setupverify
  if (commandName === "setupverify") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const embed = new EmbedBuilder()
        .setColor(0x6366f1)
        .setTitle("✅ Verify to access Veil")
        .setDescription(
          "Click the button below to verify and gain access to the server.\n\n" +
          "By verifying you agree to follow the rules in **#rules**."
        );
      const button = new ButtonBuilder()
        .setCustomId("verify_user")
        .setLabel("Verify Me")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✅");
      const row = new ActionRowBuilder().addComponents(button);
      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.editReply({ content: "Verification message posted!" });
    } catch (err) {
      console.error(err);
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }

  // /verify-user
  if (commandName === "verify-user") {
    if (!VERIFIED_ROLE_ID) {
      return interaction.reply({ content: "VERIFIED_ROLE_ID is not set in the bot .env file.", ephemeral: true });
    }
    const target = interaction.options.getMember("user");
    if (!target) return interaction.reply({ content: "User not found in this server.", ephemeral: true });
    if (target.roles.cache.has(VERIFIED_ROLE_ID)) {
      return interaction.reply({ content: `${target} is already verified.`, ephemeral: true });
    }
    try {
      await target.roles.add(VERIFIED_ROLE_ID);
      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("Manual Verify")
        .addFields(
          { name: "User",   value: `${target} (${target.user.tag})`, inline: true },
          { name: "Staff",  value: `${interaction.user.tag}`,         inline: true },
        )
        .setTimestamp());
      return interaction.reply({ content: `✅ ${target} has been manually verified.`, ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
  }

  // /unverify-user
  if (commandName === "unverify-user") {
    if (!VERIFIED_ROLE_ID) {
      return interaction.reply({ content: "VERIFIED_ROLE_ID is not set in the bot .env file.", ephemeral: true });
    }
    const target = interaction.options.getMember("user");
    if (!target) return interaction.reply({ content: "User not found in this server.", ephemeral: true });
    if (!target.roles.cache.has(VERIFIED_ROLE_ID)) {
      return interaction.reply({ content: `${target} is not verified.`, ephemeral: true });
    }
    try {
      await target.roles.remove(VERIFIED_ROLE_ID);
      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("Verification Revoked")
        .addFields(
          { name: "User",   value: `${target} (${target.user.tag})`, inline: true },
          { name: "Staff",  value: `${interaction.user.tag}`,         inline: true },
        )
        .setTimestamp());
      return interaction.reply({ content: `🚫 ${target}'s verification has been revoked.`, ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
  }

  // /approve-ad
  if (commandName === "approve-ad") {
    const target = interaction.options.getUser("user");
    if (!target) return interaction.reply({ content: "User not found.", ephemeral: true });

    const tokens = loadTokens();
    const existing = tokens.find((t) => t.userId === target.id);
    if (existing) {
      return interaction.reply({
        content: `**${target.username}** already has a token: \`${existing.token}\``,
        ephemeral: true,
      });
    }

    const token = randomUUID();
    tokens.push({ token, userId: target.id, username: target.username, approvedAt: new Date().toISOString() });
    saveTokens(tokens);

    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle("⭐ Ambassador Token")
      .setDescription(
        `Thanks for advertising Veil! Here is your exclusive ambassador token.\n\n` +
        `**Token:** \`${token}\`\n\n` +
        `Go to **veilub.mooo.com → Settings → Ambassador** and enter your token to unlock exclusive features.`
      )
      .setFooter({ text: "Keep this token private — it's linked to your account." });

    try {
      await target.send({ embeds: [embed] });
      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("Ambassador Approved")
        .addFields(
          { name: "User",  value: `${target.tag}`, inline: true },
          { name: "Staff", value: `${interaction.user.tag}`, inline: true },
        )
        .setTimestamp());
      return interaction.reply({
        content: `✅ Ambassador token generated and DMed to **${target.username}**.`,
        ephemeral: true,
      });
    } catch {
      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("Ambassador Approved (DM failed)")
        .addFields(
          { name: "User",  value: `${target.tag}`, inline: true },
          { name: "Staff", value: `${interaction.user.tag}`, inline: true },
          { name: "Token", value: `\`${token}\`` },
        )
        .setTimestamp());
      return interaction.reply({
        content: `✅ Token generated but couldn't DM **${target.username}** (DMs may be closed). Token: \`${token}\``,
        ephemeral: true,
      });
    }
  }

  // /revoke-ad
  if (commandName === "revoke-ad") {
    const target = interaction.options.getUser("user");
    if (!target) return interaction.reply({ content: "User not found.", ephemeral: true });

    const tokens = loadTokens();
    const filtered = tokens.filter((t) => t.userId !== target.id);
    if (filtered.length === tokens.length) {
      return interaction.reply({ content: `**${target.username}** has no ambassador token.`, ephemeral: true });
    }
    saveTokens(filtered);
    await modLog(interaction.guild, new EmbedBuilder()
      .setColor(0xef4444)
      .setTitle("Ambassador Revoked")
      .addFields(
        { name: "User",  value: `${target.tag}`, inline: true },
        { name: "Staff", value: `${interaction.user.tag}`, inline: true },
      )
      .setTimestamp());
    return interaction.reply({ content: `🗑️ Ambassador token revoked for **${target.username}**.`, ephemeral: true });
  }

  // /award-points
  if (commandName === "award-points") {
    const target = interaction.options.getUser("user");
    const pts    = interaction.options.getInteger("points");
    const reason = interaction.options.getString("reason") || null;

    const tokens = loadTokens();
    const entry  = tokens.find((t) => t.userId === target.id);
    if (!entry) {
      return interaction.reply({ content: `**${target.username}** is not an ambassador.`, ephemeral: true });
    }

    const before = entry.points ?? 0;
    entry.points = Math.max(0, before + pts);
    saveTokens(tokens);

    const sign = pts >= 0 ? "+" : "";
    const embed = new EmbedBuilder()
      .setColor(pts >= 0 ? 0x22c55e : 0xf87171)
      .setTitle(pts >= 0 ? "⭐ Points Awarded" : "📉 Points Deducted")
      .addFields(
        { name: "Ambassador", value: target.username,           inline: true },
        { name: "Change",     value: `${sign}${pts}`,           inline: true },
        { name: "New total",  value: `${entry.points} pts`,     inline: true },
      );
    if (reason) embed.setDescription(`**Reason:** ${reason}`);

    // Notify the ambassador via DM
    try {
      const dmEmbed = new EmbedBuilder()
        .setColor(pts >= 0 ? 0xf59e0b : 0xf87171)
        .setTitle(pts >= 0 ? "⭐ You earned leaderboard points!" : "📉 Leaderboard points adjusted")
        .setDescription(
          `${sign}${pts} points${reason ? ` — *${reason}*` : ""}.\n` +
          `Your new total: **${entry.points} pts**\n\n` +
          `Check the leaderboard at **Settings → Ambassador** on veilub.mooo.com.`
        );
      await target.send({ embeds: [dmEmbed] });
    } catch { /* DMs closed */ }

    await modLog(interaction.guild, new EmbedBuilder()
      .setColor(pts >= 0 ? 0x22c55e : 0xf87171)
      .setTitle(pts >= 0 ? "Points Awarded" : "Points Deducted")
      .addFields(
        { name: "Ambassador", value: target.tag,           inline: true },
        { name: "Change",     value: `${sign}${pts}`,      inline: true },
        { name: "New total",  value: `${entry.points} pts`,inline: true },
        { name: "Staff",      value: interaction.user.tag, inline: true },
        ...(reason ? [{ name: "Reason", value: reason }] : []),
      )
      .setTimestamp());

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // /leaderboard
  if (commandName === "leaderboard") {
    const tokens = loadTokens();
    const board = tokens
      .map((t) => ({ username: t.username, points: t.points ?? 0 }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);

    const RANK_ICONS = ["🥇", "🥈", "🥉"];
    const lines = board.map((t, i) =>
      `${RANK_ICONS[i] ?? `**${i + 1}.**`} ${t.username} — ${t.points} pts`
    );

    const embed = new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle("⭐ Ambassador Leaderboard")
      .setDescription(lines.length ? lines.join("\n") : "No ambassadors yet.")
      .setFooter({ text: "Earn points by advertising Veil. Staff award points via /award-points." })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // /beta-release
  if (commandName === "beta-release") {
    const type  = interaction.options.getString("type");
    const key   = interaction.options.getString("key");
    const label = interaction.options.getString("label");
    const days  = interaction.options.getInteger("days") ?? 14;

    const features = loadBetaFeatures();
    const existing = features.find((f) => f.type === type && f.key === key);
    if (existing) {
      return interaction.reply({
        content: `**${label}** (\`${type}:${key}\`) is already in the beta list (released <t:${Math.floor(new Date(existing.releasedAt).getTime() / 1000)}:R>).`,
        ephemeral: true,
      });
    }

    const releasedAt = new Date().toISOString();
    features.push({ id: `${type}-${key}`, type, key, label, releasedAt, betaDays: days });
    saveBetaFeatures(features);

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("🚀 Beta Feature Released")
      .addFields(
        { name: "Feature", value: `${label} (${type}: \`${key}\`)`, inline: true },
        { name: "Window",  value: `${days} days`,                   inline: true },
        { name: "Goes public", value: `<t:${Math.floor((Date.now() + days * 86400000) / 1000)}:R>`, inline: true },
      )
      .setDescription(`Ambassadors get early access. Feature unlocks for everyone <t:${Math.floor((Date.now() + days * 86400000) / 1000)}:R>.`)
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  // /beta-status
  if (commandName === "beta-status") {
    const features = loadBetaFeatures();
    if (!features.length) {
      return interaction.reply({ content: "No features in the beta system yet.", ephemeral: true });
    }
    const now = Date.now();
    const lines = features.map((f) => {
      const betaMs   = (f.betaDays ?? 14) * 86400000;
      const elapsed  = now - new Date(f.releasedAt).getTime();
      const isBeta   = elapsed < betaMs;
      const daysLeft = isBeta ? Math.ceil((betaMs - elapsed) / 86400000) : 0;
      const publicTs = Math.floor((new Date(f.releasedAt).getTime() + betaMs) / 1000);
      return isBeta
        ? `🔒 **${f.label}** (${f.type}:\`${f.key}\`) — Ambassador only · ${daysLeft}d left · public <t:${publicTs}:R>`
        : `✅ **${f.label}** (${f.type}:\`${f.key}\`) — Public since <t:${publicTs}:R>`;
    });
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("🔬 Beta Feature Status")
      .setDescription(lines.join("\n"))
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  // /freedns
  if (commandName === "freedns") {
    if (!existsSync(FREEDNS_FILE)) {
      return interaction.reply({
        content: "The FreeDNS domain list hasn't been generated yet. Run `node scripts/freedns-list.js > freedns-domains.txt` on the server first.",
        ephemeral: true,
      });
    }
    const count = interaction.options.getInteger("count") ?? 5;
    const allDomains = readFileSync(FREEDNS_FILE, "utf-8")
      .split("\n")
      .map((d) => d.trim())
      .filter(Boolean);

    // Pick `count` random unique domains
    const picked = [];
    const pool = [...allDomains];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }

    const lines = picked.map((d) => `• \`yourname.${d}\` — [add on FreeDNS](https://freedns.afraid.org/subdomain/edit.php)`);
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("🎲 Random FreeDNS Domains")
      .setDescription(lines.join("\n"))
      .setFooter({ text: `${allDomains.length} public domains available · /freedns to roll again` })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  // /findlink
  if (commandName === "findlink") {
    if (!existsSync(FREEDNS_FILE)) {
      return interaction.reply({
        content: "The FreeDNS domain list hasn't been generated yet. Run `node scripts/freedns-list.js > freedns-domains.txt` on the server first.",
        ephemeral: true,
      });
    }

    const filterKey = interaction.options.getString("filter");
    const skipUncategorized = interaction.options.getBoolean("skip_uncategorized") ?? true;
    const MONTHLY_LIMIT = 5;

    const uses = getFindlinkUses(interaction.user.id);
    if (uses >= MONTHLY_LIMIT) {
      const month = new Date().toLocaleString("en-US", { month: "long" });
      return interaction.reply({
        content: `You've used \`/findlink\` **${uses}/${MONTHLY_LIMIT}** times this month (${month}). Your limit resets on the 1st.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    incrementFindlinkUses(interaction.user.id);

    const allDomains = readFileSync(FREEDNS_FILE, "utf-8")
      .split("\n").map((d) => d.trim()).filter(Boolean);

    // Shuffle
    const pool = [...allDomains].sort(() => Math.random() - 0.5);

    const GL_TOKEN = "gl_6b3e2fc034923e71ec0054e0fb667ec1c9efa8578aec687b";
    const MAX_TRIES = 30;
    const UNCATEGORIZED = /^(uncategor|unknown|unrated|none|n\/a|other|miscellaneous)/i;
    let found = null;
    let checked = 0;
    let filterName = filterKey;

    for (const domain of pool.slice(0, MAX_TRIES)) {
      checked++;
      try {
        let results = getCachedResults(domain);
        if (!results) {
          const res = await fetch(
            `https://live.glseries.net/api/v1/check?token=${GL_TOKEN}&url=${encodeURIComponent(domain)}`
          );
          const data = await res.json();
          if (!data.success) continue;
          results = data.results;
          setCachedResults(domain, results);
        }
        const result = results.find((r) => r.filter === filterKey);
        if (result) filterName = result.name;
        const category = result?.category || "";
        const categoryOk = !skipUncategorized || !UNCATEGORIZED.test(category);
        if (result && !result.blocked && !result.error && categoryOk) {
          found = { domain, name: result.name, category };
          break;
        }
      } catch {
        // skip failed check
      }
    }

    if (!found) {
      const embed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("No Unblocked Domain Found")
        .setDescription(
          `Checked **${checked}** random FreeDNS domains against **${filterName}** — none passed.\nTry running the command again for a new random batch.`
        )
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle("Unblocked Domain Found!")
      .setDescription(`\`${found.domain}\` is **not blocked** by **${found.name}**`)
      .addFields(
        { name: "Category",     value: found.category || "Unknown", inline: true },
        { name: "Filter",       value: found.name,                  inline: true },
        { name: "Domains checked", value: `${checked}`,             inline: true },
        {
          name: "Register it on FreeDNS",
          value: `Go to [FreeDNS](https://freedns.afraid.org/subdomain/edit.php) and register a subdomain like \`yourname.${found.domain}\``,
        }
      )
      .setFooter({ text: `Powered by live.glseries.net · ${MONTHLY_LIMIT - uses - 1} uses remaining this month` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // /setuptickets
  if (commandName === "setuptickets") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const embed = new EmbedBuilder()
        .setColor(0x6366f1)
        .setTitle("🎫 Support Tickets")
        .setDescription(
          "Need help? Click the button below to open a private support ticket.\n\n" +
          "Describe your issue and a staff member will assist you as soon as possible."
        );

      const button = new ButtonBuilder()
        .setCustomId("open_ticket")
        .setLabel("Open a Ticket")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎫");

      await interaction.channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(button)],
      });

      return interaction.editReply({ content: "Ticket panel posted!" });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }

  // /ai-scan
  if (commandName === "ai-scan") {
    if (!openai) {
      return interaction.reply({ content: "❌ `OPENAI_API_KEY` is not set in the bot `.env`.", ephemeral: true });
    }
    if (!AI_ALERT_CHANNEL_ID) {
      return interaction.reply({ content: "❌ `AI_ALERT_CHANNEL_ID` is not set in the bot `.env`.", ephemeral: true });
    }
    if (msgBuffer.length < 3) {
      return interaction.reply({ content: `❌ Not enough messages buffered yet (${msgBuffer.length}/3 minimum). Send some messages in the server first, then try again.`, ephemeral: true });
    }
    const alertChannel = interaction.guild.channels.cache.get(AI_ALERT_CHANNEL_ID);
    if (!alertChannel) {
      return interaction.reply({ content: `❌ Alert channel \`${AI_ALERT_CHANNEL_ID}\` not found. Check \`AI_ALERT_CHANNEL_ID\` in the bot \`.env\`.`, ephemeral: true });
    }
    await interaction.reply({ content: `🤖 Scanning ${msgBuffer.length} buffered messages...`, ephemeral: true });
    await runAiScan(interaction.guild);
    return interaction.editReply({ content: `✅ Scan complete. Check ${alertChannel}.` });
  }

  // /makelink
  if (commandName === "makelink") {
    const subdomain = interaction.options.getString("subdomain");
    const serverIp  = process.env.SERVER_IP || "";
    if (!serverIp) return interaction.reply({ content: "❌ `SERVER_IP` is not set in the bot `.env`.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    // ── helpers ───────────────────────────────────────────────────────────────
    const FREEDNS_CREDS_FILE = join(__dirname, "../freedns-creds.json");

    function randStr(len) {
      const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
      return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    }

    async function freednsLogin(user, pass) {
      const res = await fetch("https://freedns.afraid.org/zc.php?step=2", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
        body: new URLSearchParams({ username: user, password: pass, submit: "Login" }),
        redirect: "manual",
      });
      const cookies = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean))
        .map(c => c.split(";")[0]).join("; ");
      return cookies.includes("dns_cookie") ? cookies : null;
    }

    async function createFreeDNSAccount() {
      // 1. Get a mail.tm address
      const domainsRes = await fetch("https://api.mail.tm/domains").then(r => r.json());
      const mailDomain = domainsRes?.["hydra:member"]?.[0]?.domain;
      if (!mailDomain) throw new Error("mail.tm unavailable");

      const mailUser = randStr(12);
      const mailPass = randStr(16);
      const email    = `${mailUser}@${mailDomain}`;

      await fetch("https://api.mail.tm/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: email, password: mailPass }),
      });

      const tokenRes = await fetch("https://api.mail.tm/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: email, password: mailPass }),
      }).then(r => r.json());
      const mailToken = tokenRes.token;
      if (!mailToken) throw new Error("Could not get mail.tm token");

      // 2. Sign up on FreeDNS
      const fdUser = "veil" + randStr(8);
      const fdPass = randStr(20);

      // Get signup captcha token
      const signupPage = await fetch("https://freedns.afraid.org/signup/", {
        headers: { "User-Agent": "Mozilla/5.0" },
      }).then(r => r.text());
      const captchaToken = signupPage.match(/name="captcha_token"\s+value="([^"]+)"/)?.[1] ?? "";

      await fetch("https://freedns.afraid.org/signup/?step=2", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
        body: new URLSearchParams({
          username: fdUser, password: fdPass, password2: fdPass,
          email, email2: email,
          firstname: randStr(6), lastname: randStr(8),
          captcha_token: captchaToken,
          action: "signup", send: "Send+activation+email",
        }),
      });

      // 3. Poll mail.tm for activation email (up to 3 min)
      let activationCode = null;
      for (let i = 0; i < 36; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const msgs = await fetch("https://api.mail.tm/messages", {
          headers: { Authorization: `Bearer ${mailToken}` },
        }).then(r => r.json());
        const msg = msgs?.["hydra:member"]?.[0];
        if (msg) {
          const body = await fetch(`https://api.mail.tm/messages/${msg.id}`, {
            headers: { Authorization: `Bearer ${mailToken}` },
          }).then(r => r.json());
          const text = body.text || body.html || "";
          const match = text.match(/activate\.php\?([^"'\s<>]+)/);
          if (match) { activationCode = match[1]; break; }
        }
      }
      if (!activationCode) throw new Error("Activation email never arrived (timed out after 3 min)");

      // 4. Activate
      await fetch(`https://freedns.afraid.org/signup/activate.php?${activationCode}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      return { username: fdUser, password: fdPass };
    }

    try {
      // ── Load or auto-create FreeDNS credentials ───────────────────────────
      let fdUser = process.env.FREEDNS_USER || "";
      let fdPass = process.env.FREEDNS_PASS || "";

      if (!fdUser || !fdPass) {
        if (existsSync(FREEDNS_CREDS_FILE)) {
          ({ username: fdUser, password: fdPass } = JSON.parse(readFileSync(FREEDNS_CREDS_FILE, "utf-8")));
        }
      }

      let cookies = fdUser ? await freednsLogin(fdUser, fdPass) : null;

      if (!cookies) {
        await interaction.editReply({ content: "⏳ No FreeDNS account found — auto-creating one via mail.tm… (up to 3 min)" });
        const creds = await createFreeDNSAccount();
        writeFileSync(FREEDNS_CREDS_FILE, JSON.stringify(creds, null, 2));
        fdUser = creds.username; fdPass = creds.password;
        cookies = await freednsLogin(fdUser, fdPass);
        if (!cookies) throw new Error("Newly created account failed to log in");
        await interaction.editReply({ content: `✅ FreeDNS account created (\`${fdUser}\`). Creating subdomain…` });
      }

      // ── Pick a random public domain ───────────────────────────────────────
      const pageNum = Math.floor(Math.random() * 3) + 1;
      const regHtml = await fetch(`https://freedns.afraid.org/domain/registry/?page=${pageNum}&sort=2&q=`, {
        headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
      }).then(r => r.text());

      const domainMatches = [...regHtml.matchAll(/edit_domain_id=(\d+)">([\w.-]+)<\/a>(?:(?!<tr).)*?<td>public<\/td>/gs)];
      if (!domainMatches.length) return interaction.editReply({ content: "❌ Could not fetch domain list from FreeDNS." });

      const pick = domainMatches[Math.floor(Math.random() * domainMatches.length)];
      const domainId = pick[1];
      const domainName = pick[2];

      // ── Create subdomain ──────────────────────────────────────────────────
      const sub = subdomain || `veil${randStr(6)}`;
      const createRes = await fetch("https://freedns.afraid.org/subdomain/save.php?step=2", {
        method: "POST",
        headers: {
          Cookie: cookies,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0",
          Referer: "https://freedns.afraid.org/subdomain/edit.php",
        },
        body: new URLSearchParams({
          type: "A", subdomain: sub, domain_id: domainId,
          address: serverIp, send: "Save!", skip_duplicate: "0",
        }),
      });
      const createHtml = await createRes.text();
      const fullDomain = `${sub}.${domainName}`;

      const success = createHtml.includes("has been saved") || createHtml.includes("Successfully") ||
                      !createHtml.includes("error") && createRes.redirected;

      const embed = new EmbedBuilder()
        .setColor(success ? 0x57F287 : 0xFEE75C)
        .setTitle(success ? "✅ Link Created" : "⚠️ Link May Have Been Created")
        .addFields(
          { name: "URL", value: `https://${fullDomain}` },
          { name: "Points to", value: serverIp },
          { name: "Account", value: `\`${fdUser}\`` },
        )
        .setFooter({ text: "DNS may take 1–5 minutes to propagate" })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });

    } catch (e) {
      console.error("[makelink] error:", e);
      return interaction.editReply({ content: `❌ Error: ${e.message}` });
    }
  }

  // /uptime
  if (commandName === "uptime") {
    const ms = Date.now() - BOT_START;
    const hours   = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("Bot Uptime")
      .setDescription(`🕐 **${hours}h ${minutes}m ${seconds}s**`)
      .setFooter({ text: `Started at ${new Date(BOT_START).toUTCString()}` });
    return interaction.reply({ embeds: [embed] });
  }
});

client.login(DISCORD_TOKEN);
