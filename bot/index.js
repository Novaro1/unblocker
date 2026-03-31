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
  try { return JSON.parse(readFileSync(FINDLINK_CACHE_FILE, "utf-8")); } catch { return {}; }
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
  try { return JSON.parse(readFileSync(FINDLINK_USAGE_FILE, "utf-8")); } catch { return {}; }
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
  try { return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")); } catch { return {}; }
}

function saveConfig(cfg) {
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// ── Ambassador token storage ────────────────────────────────────────────────
function loadTokens() {
  if (!existsSync(TOKENS_FILE)) return [];
  try { return JSON.parse(readFileSync(TOKENS_FILE, "utf-8")); } catch { return []; }
}

function saveTokens(tokens) {
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

// ── Beta feature storage ────────────────────────────────────────────────────
function loadBetaFeatures() {
  if (!existsSync(BETA_FEATURES_FILE)) return [];
  try { return JSON.parse(readFileSync(BETA_FEATURES_FILE, "utf-8")); } catch { return []; }
}

function saveBetaFeatures(features) {
  writeFileSync(BETA_FEATURES_FILE, JSON.stringify(features, null, 2));
}

// ── Link storage ───────────────────────────────────────────────────────────
function loadLinks() {
  if (!existsSync(LINKS_FILE)) return [];
  try { return JSON.parse(readFileSync(LINKS_FILE, "utf-8")); } catch { return []; }
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
  "links", "status", "serverinfo", "uptime",
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

// ── Ping roles ───────────────────────────────────────────────────────────────
const PING_ROLES = [
  { id: "ping_announcements", label: "Announcements", emoji: "📣", color: 0xf59e0b, desc: "Server announcements & important updates" },
  { id: "ping_newlinks",      label: "New Links",     emoji: "🔗", color: 0x6366f1, desc: "Notified when new proxy links are added" },
  { id: "ping_updates",       label: "Updates",       emoji: "🛠️", color: 0x22c55e, desc: "Feature updates & changelog" },
  { id: "ping_polls",         label: "Polls",         emoji: "📊", color: 0x8b5cf6, desc: "Community polls & votes" },
];

// Find or create the Discord role for a ping category
async function ensurePingRole(guild, ping) {
  const roleName = `Ping: ${ping.label}`;
  let role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: ping.color,
      mentionable: true,
      reason: "Auto-created ping role for notification system",
    });
  }
  return role;
}

// Get the Discord role for a ping category (null if not yet created)
function getPingRole(guild, pingId) {
  const ping = PING_ROLES.find(p => p.id === pingId);
  if (!ping) return null;
  return guild.roles.cache.find(r => r.name === `Ping: ${ping.label}`) || null;
}

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

function buildLinkEmbed(link, index) {
  const typeLabel = link.type === "static" ? "Static" : "Full";
  const typeIcon = link.type === "static" ? "📄" : "🌐";
  let desc = `${typeIcon} **${typeLabel}** — **[${link.name || link.url}](${link.url})**`;
  if (link.unblocked && link.unblocked.length) {
    const filterList = link.unblocked.join(" · ");
    // Keep under 4096 embed desc limit (leave room for header + submitter)
    if (desc.length + filterList.length + 20 > 4000) {
      desc += `\n✅ Bypasses **${link.unblocked.length}** filters`;
    } else {
      desc += `\n✅ Works on: ${filterList}`;
    }
  }
  if (link.submittedBy) {
    desc += `\n👤 Submitted by ${link.submittedBy}`;
  }
  return new EmbedBuilder()
    .setColor(link.type === "static" ? 0x22c55e : 0x6366f1)
    .setDescription(desc);
}

// Post a single link embed to the live links channel and save its message ID
async function postLinkMessage(link) {
  const cfg = loadConfig();
  if (!cfg.linksChannelId) return;
  try {
    const ch = await client.channels.fetch(cfg.linksChannelId);
    const idx = loadLinks().findIndex(l => l.url === link.url);
    // Ping New Links role
    const guild = ch.guild;
    const role = getPingRole(guild, "ping_newlinks");
    const content = role ? `<@&${role.id}>` : undefined;
    const msg = await ch.send({ content, embeds: [buildLinkEmbed(link, idx)] });
    if (!cfg.linksMessageMap) cfg.linksMessageMap = {};
    cfg.linksMessageMap[link.url] = msg.id;
    saveConfig(cfg);
  } catch (e) { console.error("[livelinks] post error:", e.message); }
}

// Delete a link's message from the live links channel
async function deleteLinkMessage(url) {
  const cfg = loadConfig();
  if (!cfg.linksChannelId || !cfg.linksMessageMap || !cfg.linksMessageMap[url]) return;
  try {
    const ch = await client.channels.fetch(cfg.linksChannelId);
    const msg = await ch.messages.fetch(cfg.linksMessageMap[url]);
    await msg.delete();
  } catch { /* already deleted */ }
  delete cfg.linksMessageMap[url];
  saveConfig(cfg);
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
  // Update individual link messages if they exist
  if (cfg.linksChannelId && cfg.linksMessageMap) {
    const links = loadLinks();
    const ch = await client.channels.fetch(cfg.linksChannelId).catch(() => null);
    if (!ch) return;
    for (const link of links) {
      const msgId = cfg.linksMessageMap[link.url];
      if (!msgId) continue;
      try {
        const idx = links.findIndex(l => l.url === link.url);
        const msg = await ch.messages.fetch(msgId);
        await msg.edit({ embeds: [buildLinkEmbed(link, idx)] });
      } catch { /* message deleted */ }
    }
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

// ── Pending FreeDNS signups (userId -> { sessionCookies, mailToken, fdUser, fdPass, sub, serverIp }) ──
const pendingFreeDNS = new Map();

// ── FreeDNS: find a domain from the registry ────────────────────────────────
async function freednsFindDomain(cookies, targetDomain) {
  if (targetDomain) {
    const searchHtml = await fetch(
      `https://freedns.afraid.org/domain/registry/?page=1&sort=2&q=${encodeURIComponent(targetDomain)}`,
      { headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" } }
    ).then(r => r.text());
    const m = searchHtml.match(
      new RegExp(`edit_domain_id=(\\d+)>(?:<[^>]+>)?${targetDomain.replace(/\./g, "\\.")}`)
    );
    if (!m) return null;
    return { domainId: m[1], domainName: targetDomain };
  }

  // Pick a random public domain from a random registry page
  const pageNum = Math.floor(Math.random() * 3) + 1;
  const regHtml = await fetch(`https://freedns.afraid.org/domain/registry/?page=${pageNum}&sort=2&q=`, {
    headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0" },
  }).then(r => r.text());
  const domainMatches = [...regHtml.matchAll(
    /<a href=\/subdomain\/edit\.php\?edit_domain_id=(\d+)>([\w.-]+)<\/a>(?:(?!<tr).)*?<td>public<\/td>/gs
  )];
  if (!domainMatches.length) return null;
  const pick = domainMatches[Math.floor(Math.random() * domainMatches.length)];
  return { domainId: pick[1], domainName: pick[2] };
}

// ── FreeDNS: save a subdomain record (requires CAPTCHA code + combined cookies) ──
// Returns { domain } on success, { needsCaptcha: true } if CAPTCHA required, { error } on other failure
async function freednsTrySave(cookies, captchaCode, captchaPhpsessid, sub, domainId, domainName, serverIp) {
  const allCookies = captchaPhpsessid ? `${captchaPhpsessid}; ${cookies}` : cookies;
  const body = { type: "A", subdomain: sub, domain_id: domainId, address: serverIp, send: "Save!", skip_duplicate: "0" };
  if (captchaCode) body.captcha_code = captchaCode;
  const saveRes = await fetch("https://freedns.afraid.org/subdomain/save.php?step=2", {
    method: "POST",
    headers: { Cookie: allCookies, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0", Referer: "https://freedns.afraid.org/subdomain/edit.php" },
    body: new URLSearchParams(body),
  });
  const saveHtml = await saveRes.text();
  if (!/<title>\s*Problems!/i.test(saveHtml)) return { domain: `${sub}.${domainName}` };
  if (/security code|captcha/i.test(saveHtml)) return { needsCaptcha: true };
  return { error: saveHtml.match(/<b[^>]*>([^<]{5,200})<\/b>/i)?.[1]?.trim() || "Save failed" };
}

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

  // ── Ping role toggle buttons ──────────────────────────────────────────────
  if (interaction.customId.startsWith("ping_")) {
    const ping = PING_ROLES.find(p => p.id === interaction.customId);
    if (ping) {
      try {
        const role = await ensurePingRole(interaction.guild, ping);
        const has = interaction.member.roles.cache.has(role.id);
        if (has) {
          await interaction.member.roles.remove(role);
          return interaction.reply({ content: `${ping.emoji} Removed **${ping.label}** pings. You won't be notified for these anymore.`, ephemeral: true });
        } else {
          await interaction.member.roles.add(role);
          return interaction.reply({ content: `${ping.emoji} You'll now be pinged for **${ping.label}**!`, ephemeral: true });
        }
      } catch (err) {
        return interaction.reply({ content: `Error toggling role: ${err.message}`, ephemeral: true });
      }
    }
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

  // FreeDNS captcha button
  if (interaction.customId === "freedns_captcha_btn") {
    const pending = pendingFreeDNS.get(interaction.user.id);
    if (!pending) return interaction.reply({ content: "❌ Session expired. Run `/makelink` again.", ephemeral: true });

    const modal = new ModalBuilder()
      .setCustomId("freedns_captcha_modal")
      .setTitle("FreeDNS — Enter CAPTCHA");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("captcha_code")
          .setLabel("Type the text from the image above")
          .setStyle(TextInputStyle.Short)
          .setRequired(true).setMinLength(4).setMaxLength(8)
          .setPlaceholder("e.g. XKQFT"),
      ),
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

  if (interaction.customId === "freedns_captcha_modal") {
    const pending = pendingFreeDNS.get(interaction.user.id);
    if (!pending) return interaction.reply({ content: "❌ Session expired. Run `/makelink` again.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const captchaCode = interaction.fields.getTextInputValue("captcha_code").trim();
    pendingFreeDNS.delete(interaction.user.id);

    // ── Subdomain-only CAPTCHA (existing account already logged in) ──────────
    if (pending.mode === "subdomain") {
      const { phpsessid, dnsCookie, domainId, domainName, sub, serverIp, filterKey, filterName, fdUser } = pending;
      try {
        const saveResult = await freednsTrySave(dnsCookie, captchaCode, phpsessid, sub, domainId, domainName, serverIp);
        if (!saveResult.domain) return interaction.editReply({ content: `❌ ${saveResult.error || "CAPTCHA incorrect or subdomain creation failed"}. Run \`/makelink\` again.` });
        const fullDomain = saveResult.domain;
        const embedFields = [
          { name: "URL", value: `https://${fullDomain}` },
          { name: "Points to", value: serverIp },
        ];
        if (fdUser) embedFields.push({ name: "Account", value: `\`${fdUser}\`` });
        if (filterKey) embedFields.push({ name: "Unblocked by", value: filterName || filterKey });
        return interaction.editReply({ embeds: [
          new EmbedBuilder().setColor(0x57F287).setTitle("✅ FreeDNS Link Created")
            .addFields(...embedFields)
            .setFooter({ text: "DNS may take 1–5 minutes to propagate" }).setTimestamp(),
        ]});
      } catch (e) {
        console.error("[makelink/subdomain captcha] error:", e);
        return interaction.editReply({ content: `❌ Error: ${e.message}` });
      }
    }

    // Unknown pending mode
    return interaction.editReply({ content: "❌ Session expired. Run `/makelink` again." });
  }

  // /addfreedns modal
  if (interaction.customId === "addfreedns_modal") {
    const username = interaction.fields.getTextInputValue("fdns_username").trim();
    const password = interaction.fields.getTextInputValue("fdns_password").trim();
    const email    = interaction.fields.getTextInputValue("fdns_email").trim() || null;

    const FREEDNS_ACCOUNTS_FILE = join(__dirname, "../freedns-accounts.json");
    let list = [];
    if (existsSync(FREEDNS_ACCOUNTS_FILE)) {
      try { list = JSON.parse(readFileSync(FREEDNS_ACCOUNTS_FILE, "utf-8")); } catch {}
      if (!Array.isArray(list)) list = [];
    }

    if (list.some(a => a.username === username))
      return interaction.reply({ content: `❌ Account \`${username}\` is already in the pool.`, ephemeral: true });

    const entry = { username, password };
    if (email) entry.email = email;
    list.push(entry);
    writeFileSync(FREEDNS_ACCOUNTS_FILE, JSON.stringify(list, null, 2));

    return interaction.reply({
      content: `✅ Added \`${username}\` to the FreeDNS account pool (${list.length} account${list.length !== 1 ? "s" : ""} total).`,
      ephemeral: true,
    });
  }
});

// ── FreeDNS "I've activated" button ────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton() || interaction.customId !== "freedns_activated_btn") return;
  const pending = pendingFreeDNS.get(interaction.user.id);
  if (!pending || pending.mode !== "activate") return interaction.reply({ content: "❌ Session expired. Run `/makelink` again.", ephemeral: true });

  await interaction.deferUpdate();
  const { fdUser, fdPass, email, sub, serverIp, targetDomain, filterKey, skipUncategorized } = pending;
  pendingFreeDNS.delete(interaction.user.id);

  try {
    const loginRes = await fetch("https://freedns.afraid.org/zc.php?step=2", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
      body: new URLSearchParams({ username: email, password: fdPass, action: "auth", submit: "Login" }),
      redirect: "manual",
    });
    const allCookies2 = loginRes.headers.getSetCookie?.() ?? [loginRes.headers.get("set-cookie")].filter(Boolean);
    const cookies = allCookies2.map(c => c.split(";")[0]).join("; ");
    if (!cookies.includes("dns_cookie"))
      return interaction.editReply({ content: "❌ Login failed — account may not be activated yet. Please click the link first, then press the button." });

    // If a filter was specified, find an unblocked domain first
    let chosenDomain = targetDomain;
    let filterName = filterKey;
    if (filterKey && !chosenDomain) {
        const FREEDNS_FILE = join(__dirname, "../freedns-domains.txt");
        if (!existsSync(FREEDNS_FILE))
          return interaction.editReply({ content: "❌ FreeDNS domain list not generated yet on the server." });

        await interaction.editReply({ content: `🔍 Searching for a domain unblocked by **${filterKey}**…` });
        const GL_TOKEN = "gl_6b3e2fc034923e71ec0054e0fb667ec1c9efa8578aec687b";
        const UNCATEGORIZED = /^(uncategor|unknown|unrated|none|n\/a|other|miscellaneous)/i;
        const pool = readFileSync(FREEDNS_FILE, "utf-8").split("\n").map(d => d.trim()).filter(Boolean)
          .sort(() => Math.random() - 0.5).slice(0, 30);

        for (const domain of pool) {
          try {
            let results = getCachedResults(domain);
            if (!results) {
              const data = await fetch(
                `https://live.glseries.net/api/v1/check?token=${GL_TOKEN}&url=${encodeURIComponent(domain)}`
              ).then(r => r.json());
              if (!data.success) continue;
              results = data.results;
              setCachedResults(domain, results);
            }
            const result = results.find(r => r.filter === filterKey);
            if (result) filterName = result.name;
            const category = result?.category || "";
            const categoryOk = !skipUncategorized || !UNCATEGORIZED.test(category);
            if (result && !result.blocked && !result.error && categoryOk) {
              chosenDomain = domain;
              break;
            }
          } catch {}
        }
        if (!chosenDomain)
          return interaction.editReply({ content: `❌ No unblocked domain found for **${filterName || filterKey}** after checking 30 domains. Try again.` });
      }

      // FreeDNS also requires CAPTCHA for subdomain creation — fetch a new image
      const domainInfo = await freednsFindDomain(cookies, chosenDomain);
      if (!domainInfo) return interaction.editReply({ content: chosenDomain ? `❌ Could not find \`${chosenDomain}\` in the FreeDNS public registry. The \`domain\` option only accepts FreeDNS shared domains (e.g. \`mooo.com\`, \`chickenkiller.com\`). Use \`/freedns\` to browse available domains.` : "❌ No public domains found. Try again." });

      const captchaRes2 = await fetch("https://freedns.afraid.org/securimage/securimage_show.php", { headers: { "User-Agent": "Mozilla/5.0" } });
      const captchaSess2 = (captchaRes2.headers.getSetCookie?.() ?? [captchaRes2.headers.get("set-cookie")].filter(Boolean)).map(c => c.split(";")[0]).join("; ");
      const captchaImg2 = Buffer.from(await captchaRes2.arrayBuffer());
      const dnsCookiePart = cookies.split("; ").find(c => c.startsWith("dns_cookie")) || "";

      pendingFreeDNS.set(interaction.user.id, {
        mode: "subdomain",
        phpsessid: captchaSess2,
        dnsCookie: dnsCookiePart,
        domainId: domainInfo.domainId,
        domainName: domainInfo.domainName,
        sub, serverIp, filterKey, filterName,
        fdUser,
        expiresAt: Date.now() + 15 * 60 * 1000,
      });

      const btn2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("freedns_captcha_btn").setLabel("Enter CAPTCHA Code").setStyle(ButtonStyle.Primary),
      );
      return interaction.editReply({
        content: `✅ Account \`${fdUser}\` activated! One more CAPTCHA to create the subdomain:`,
        files: [{ attachment: captchaImg2, name: "captcha.png" }],
        components: [btn2],
      });
    } catch (e) {
      console.error("[makelink/freedns activated] error:", e);
      return interaction.editReply({ content: `❌ Error: ${e.message}` });
    }
});

// ── Slash commands ─────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  // Restrict public commands to #bot-commands (staff can use them anywhere)
  const isStaff = interaction.member?.permissions?.has?.("ManageMessages");
  if (PUBLIC_COMMANDS.has(commandName) && !isStaff && BOT_COMMANDS_CHANNEL_ID && interaction.channel.id !== BOT_COMMANDS_CHANNEL_ID) {
    return interaction.reply({
      content: `Please use bot commands in <#${BOT_COMMANDS_CHANNEL_ID}>.`,
      ephemeral: true,
    });
  }

  // /links
  if (commandName === "links") {
    const links = loadLinks();
    if (!links.length) return interaction.reply({ content: "No links yet. Staff can add one with `/addlink`.", ephemeral: true });
    const embeds = links.map((l, i) => buildLinkEmbed(l, i));
    // Discord allows max 10 embeds per message
    await interaction.reply({ embeds: embeds.slice(0, 10) });
    for (let i = 10; i < embeds.length; i += 10) {
      await interaction.followUp({ embeds: embeds.slice(i, i + 10) });
    }
    return;
  }

  // /addlink
  if (commandName === "addlink") {
    const url       = interaction.options.getString("url");
    const name      = interaction.options.getString("name") || new URL(url).hostname;
    const linkType  = interaction.options.getString("type") || "full";
    const submitter = interaction.options.getUser("submitter");
    const links = loadLinks();
    if (links.find((l) => l.url === url)) {
      return interaction.reply({ content: "That link is already in the list.", ephemeral: true });
    }
    await interaction.deferReply();
    const entry = { url, name, type: linkType, addedAt: new Date().toISOString() };
    if (submitter) {
      entry.submittedBy   = submitter.username;
      entry.submittedById = submitter.id;
    }
    // Auto-check which filters this URL passes
    const GL_TOKEN = "gl_6b3e2fc034923e71ec0054e0fb667ec1c9efa8578aec687b";
    const domain = new URL(url).hostname;
    let passedFilters = [];
    let totalChecked = 0;
    try {
      let results = getCachedResults(domain);
      if (!results) {
        const res = await fetch(
          `https://live.glseries.net/api/v1/check?token=${GL_TOKEN}&url=${encodeURIComponent(domain)}`
        );
        const data = await res.json();
        if (data.success) {
          results = data.results;
          setCachedResults(domain, results);
        }
      }
      if (results) {
        const UNCATEGORIZED = /^(uncategor|unknown|unrated|none|n\/a|other|miscellaneous)/i;
        totalChecked = results.length;
        passedFilters = results
          .filter((r) => !r.blocked && !r.error)
          .map((r) => {
            const cat = r.category || "";
            if (UNCATEGORIZED.test(cat)) return `${r.name} (${cat.toLowerCase()})`;
            return r.name;
          });
      }
    } catch (e) {
      console.error("[addlink] filter check failed:", e.message);
    }
    entry.unblocked = passedFilters;
    links.push(entry);
    saveLinks(links);
    postLinkMessage(entry);
    const filterSummary = passedFilters.length
      ? `\n✅ Unblocked on: **${passedFilters.join("**, **")}**`
      : totalChecked > 0
        ? "\n⚠️ Blocked on all checked filters."
        : "\n⚠️ Could not check filters (API error).";
    return interaction.editReply({ content: `Added **${name}** to the links list.${filterSummary}` });
  }

  // /updatelink
  if (commandName === "updatelink") {
    const url       = interaction.options.getString("url");
    const name      = interaction.options.getString("name");
    const linkType  = interaction.options.getString("type");
    const submitter = interaction.options.getUser("submitter");
    const unblocked = interaction.options.getString("unblocked");
    const links = loadLinks();
    const entry = links.find((l) => l.url === url);
    if (!entry) {
      return interaction.reply({ content: "Link not found.", ephemeral: true });
    }
    if (name)      entry.name = name;
    if (linkType)  entry.type = linkType;
    if (submitter) { entry.submittedBy = submitter.username; entry.submittedById = submitter.id; }
    if (unblocked !== null) {
      entry.unblocked = unblocked.split(",").map((s) => s.trim()).filter(Boolean);
    }
    saveLinks(links);
    refreshLiveMessages();
    return interaction.reply({ content: `Updated **${entry.name}**${linkType ? ` (type: ${linkType})` : ""}.`, ephemeral: true });
  }

  // /bulkedit
  if (commandName === "bulkedit") {
    const contains   = interaction.options.getString("contains").toLowerCase();
    const linkType   = interaction.options.getString("type");
    const namePrefix = interaction.options.getString("name_prefix");
    const unblocked  = interaction.options.getString("unblocked");
    const links = loadLinks();
    const matches = links.filter(l => l.url.toLowerCase().includes(contains));
    if (!matches.length) {
      return interaction.reply({ content: `No links found containing **${contains}**.`, ephemeral: true });
    }
    const changes = [];
    for (const entry of matches) {
      if (linkType)   entry.type = linkType;
      if (namePrefix) entry.name = namePrefix;
      if (unblocked !== null) {
        entry.unblocked = unblocked.split(",").map(s => s.trim()).filter(Boolean);
      }
    }
    if (linkType)   changes.push(`type → ${linkType}`);
    if (namePrefix) changes.push(`name → ${namePrefix}`);
    if (unblocked !== null) changes.push(`filters updated`);
    saveLinks(links);
    refreshLiveMessages();
    return interaction.reply({
      content: `Bulk edited **${matches.length}** link(s) matching "**${contains}**": ${changes.join(", ")}`,
    });
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
    deleteLinkMessage(url);
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
        "The easiest way is to use the **FreeDNS Helper** browser extension — it auto-fills everything for you.\n\n" +
        "**Get the extension:** https://veilub.mooo.com/extension\n\n" +
        "Or manually:\n" +
        "1. Go to [freedns.afraid.org](https://freedns.afraid.org) → create a free account\n" +
        "2. Click **Subdomains** → **Add**\n" +
        "3. Set Type: `A` | Enter any subdomain name | Pick a domain | Destination: `16.59.60.231`\n" +
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
        "• Ambassador leaderboard rank",
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
    let pingContent = undefined;
    if (ping) {
      const role = getPingRole(interaction.guild, "ping_announcements");
      pingContent = role ? `<@&${role.id}>` : "@everyone";
    }
    await channel.send({ content: pingContent, embeds: [embed] });
    return interaction.reply({ content: `Announcement posted!${ping ? ` (${pingContent ? "pinged Announcements role" : "pinged @everyone"})` : " (no ping)"}`, ephemeral: true });
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
      const links = loadLinks();
      const cfg = loadConfig();
      cfg.linksChannelId = interaction.channel.id;
      cfg.linksMessageMap = {};
      // Clean up old fields
      delete cfg.linksMessageId;
      delete cfg.linksMessageIds;
      // Post one message per link
      for (const link of links) {
        const idx = links.findIndex(l => l.url === link.url);
        const msg = await interaction.channel.send({ embeds: [buildLinkEmbed(link, idx)] });
        cfg.linksMessageMap[link.url] = msg.id;
      }
      saveConfig(cfg);
      return interaction.editReply({ content: `Posted ${links.length} link(s). New links will be added automatically.` });
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

  // /searchlinks
  if (commandName === "searchlinks") {
    const filterName = interaction.options.getString("filter");
    const typeFilter = interaction.options.getString("type") || "all";
    const links = loadLinks();
    const matches = links.filter(l => {
      if (!l.unblocked || !l.unblocked.length) return false;
      // Case-insensitive exact match on filter names
      const hasFilter = l.unblocked.some(f => f.toLowerCase() === filterName.toLowerCase());
      if (!hasFilter) return false;
      if (typeFilter === "full") return l.type !== "static";
      if (typeFilter === "static") return l.type === "static";
      return true;
    });
    if (!matches.length) {
      return interaction.reply({
        content: `No links found that bypass **${filterName}**${typeFilter !== "all" ? ` (${typeFilter} only)` : ""}. Try \`/findlink\` to search for a new FreeDNS domain.`,
        ephemeral: true,
      });
    }
    const pick = matches[Math.floor(Math.random() * matches.length)];
    const typeLabel = typeFilter !== "all" ? ` (${typeFilter})` : "";
    return interaction.reply({
      content: `Here's a link that bypasses **${filterName}**${typeLabel} (${matches.length} total — run again for another):`,
      embeds: [buildLinkEmbed(pick, 0)],
    });
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
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("Create a FreeDNS Link")
      .setDescription("Subdomain creation is done through the **FreeDNS Helper** browser extension — it works directly in your browser so there are no IP blocks or CAPTCHA issues.")
      .addFields(
        {
          name: "Download & Install",
          value: [
            "1. Go to **https://veilub.mooo.com/extension** and click **Download Extension**",
            "2. Unzip the downloaded file",
            "3. Open Chrome → `chrome://extensions` → enable **Developer mode**",
            "4. Click **Load unpacked** and select the unzipped folder",
          ].join("\n"),
        },
        {
          name: "Create an Account",
          value: [
            "1. Go to <https://freedns.afraid.org/signup/>",
            "2. Click **Auto-Fill Form** in the purple bar — it fills everything including a temp email",
            "3. Solve the CAPTCHA and submit",
            "4. Click **Activate Account** when the activation email arrives in the panel",
          ].join("\n"),
        },
        {
          name: "Create a Subdomain",
          value: [
            "1. Log into <https://freedns.afraid.org/>",
            "2. Go to **Subdomains → Add Subdomain**",
            "3. Click **Create Veil Subdomain** in the purple bar",
            "4. Pick a domain from the dropdown, click **Save**",
            "   — the new URL is shown and ready to copy",
          ].join("\n"),
        },
        {
          name: "One-time Setup",
          value: "Open the extension popup → **Server Settings** and enter the **Server IP**: `16.59.60.231`",
        }
      )
      .setFooter({ text: "FreeDNS Helper extension · Staff only" });
    return interaction.reply({ embeds: [embed] });
  }

  // /makelink-status
  if (commandName === "makelink-status") {
    const FREEDNS_ACCOUNTS_FILE = join(__dirname, "../freedns-accounts.json");
    const accounts = [];
    if (process.env.FREEDNS_USER && process.env.FREEDNS_PASS)
      accounts.push({ username: process.env.FREEDNS_USER });
    if (existsSync(FREEDNS_ACCOUNTS_FILE)) {
      try {
        const list = JSON.parse(readFileSync(FREEDNS_ACCOUNTS_FILE, "utf-8"));
        if (Array.isArray(list)) list.forEach(a => { if (a.username && a.password) accounts.push({ username: a.username }); });
      } catch {}
    }
    const count = accounts.length;
    const embed = new EmbedBuilder()
      .setColor(count ? 0x57F287 : 0xED4245)
      .setTitle("FreeDNS Account Pool")
      .addFields(
        { name: "Accounts configured", value: String(count), inline: true },
        { name: "Max subdomains", value: count ? `~${count * 5} (${count} × 5)` : "0", inline: true },
      )
      .setDescription(
        count
          ? `Accounts: ${accounts.map(a => `\`${a.username}\``).join(", ")}\n\nEach free FreeDNS account supports **5 subdomains**. Use \`/addfreedns\` to add more accounts.`
          : "No accounts configured. Use `/addfreedns` to add one, or edit `freedns-accounts.json` on the server."
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // /addfreedns
  if (commandName === "addfreedns") {
    const modal = new ModalBuilder()
      .setCustomId("addfreedns_modal")
      .setTitle("Add FreeDNS Account");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("fdns_username").setLabel("FreeDNS username").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("fdns_password").setLabel("FreeDNS password").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("fdns_email").setLabel("Email (used for login, if different)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("Leave blank if same as username")
      ),
    );
    return interaction.showModal(modal);
  }

  // /uptime
  // /setuppings
  if (commandName === "setuppings") {
    // Ensure all roles exist
    for (const ping of PING_ROLES) {
      await ensurePingRole(interaction.guild, ping);
    }

    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("🔔 Notification Preferences")
      .setDescription("Choose what you want to be pinged for. Click a button to toggle — click again to turn it off.\n\n"
        + PING_ROLES.map(p => `${p.emoji} **${p.label}** — ${p.desc}`).join("\n"));

    const rows = [];
    // 4 buttons fit in one row
    const row = new ActionRowBuilder();
    for (const ping of PING_ROLES) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(ping.id)
          .setLabel(ping.label)
          .setEmoji(ping.emoji)
          .setStyle(ButtonStyle.Secondary)
      );
    }
    rows.push(row);

    await interaction.channel.send({ embeds: [embed], components: rows });
    return interaction.reply({ content: "Ping role picker posted!", ephemeral: true });
  }

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
