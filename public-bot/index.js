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
  PermissionFlagsBits,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR          = join(__dirname, "data");
const CONFIGS_FILE      = join(DATA_DIR, "guild-configs.json");
const GIVEAWAYS_FILE    = join(DATA_DIR, "giveaways.json");
const FINDLINK_CACHE    = join(DATA_DIR, "findlink-cache.json");
const FINDLINK_USAGE    = join(DATA_DIR, "findlink-usage.json");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ── Storage helpers ──────────────────────────────────────────────────────────

function load(file, fallback) {
  if (!existsSync(file)) return fallback;
  try { return JSON.parse(readFileSync(file, "utf-8")); } catch { return fallback; }
}

function save(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2));
}

// Per-guild config
function getConfig(guildId) {
  const all = load(CONFIGS_FILE, {});
  return all[guildId] ?? {};
}

function setConfig(guildId, patch) {
  const all = load(CONFIGS_FILE, {});
  all[guildId] = { ...(all[guildId] ?? {}), ...patch };
  save(CONFIGS_FILE, all);
  return all[guildId];
}

// Giveaways
function loadGiveaways() { return load(GIVEAWAYS_FILE, {}); }
function saveGiveaways(g) { save(GIVEAWAYS_FILE, g); }

// Findlink cache
function getFindlinkCache(domain) {
  const cache = load(FINDLINK_CACHE, {});
  const month = new Date().toISOString().slice(0, 7);
  return cache[`${month}:${domain}`] ?? null;
}
function setFindlinkCache(domain, results) {
  const cache = load(FINDLINK_CACHE, {});
  const month = new Date().toISOString().slice(0, 7);
  for (const key of Object.keys(cache)) {
    if (!key.startsWith(month + ":")) delete cache[key];
  }
  cache[`${month}:${domain}`] = results;
  save(FINDLINK_CACHE, cache);
}

// Findlink usage
function getFindlinkUses(userId) {
  const data = load(FINDLINK_USAGE, {});
  const month = new Date().toISOString().slice(0, 7);
  return data[userId]?.[month] ?? 0;
}
function incrementFindlinkUses(userId) {
  const data = load(FINDLINK_USAGE, {});
  const month = new Date().toISOString().slice(0, 7);
  if (!data[userId]) data[userId] = {};
  data[userId][month] = (data[userId][month] ?? 0) + 1;
  save(FINDLINK_USAGE, data);
  return data[userId][month];
}

// Warnings
function getWarnings(guildId, userId) {
  return getConfig(guildId).warnings?.[userId] ?? [];
}
function addWarning(guildId, userId, warning) {
  const cfg = getConfig(guildId);
  if (!cfg.warnings) cfg.warnings = {};
  if (!cfg.warnings[userId]) cfg.warnings[userId] = [];
  cfg.warnings[userId].push(warning);
  setConfig(guildId, { warnings: cfg.warnings });
}
function clearWarnings(guildId, userId) {
  const cfg = getConfig(guildId);
  if (cfg.warnings) {
    delete cfg.warnings[userId];
    setConfig(guildId, { warnings: cfg.warnings });
  }
}

// ── Permission helpers ───────────────────────────────────────────────────────

function isMod(member, cfg) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  if (cfg?.staffRoleId && member.roles.cache.has(cfg.staffRoleId)) return true;
  return false;
}

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// ── Utility ──────────────────────────────────────────────────────────────────

function checkUrl(url) {
  return new Promise((resolve) => {
    try {
      const start = Date.now();
      https.get(url, (res) => {
        res.resume();
        resolve({ online: true, code: res.statusCode, ms: Date.now() - start });
      }).on("error", () => resolve({ online: false, ms: Date.now() - start }));
    } catch {
      resolve({ online: false, ms: 0 });
    }
  });
}

function parseDuration(str) {
  const match = str.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return n * units[match[2].toLowerCase()];
}

function formatDuration(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
  return `${Math.round(ms / 86400000)}d`;
}

const VEIL_COLOR = 0x6366f1;
const BOT_START  = Date.now();

// ── Giveaway system ──────────────────────────────────────────────────────────

const activeGiveaways = new Map(); // messageId -> timeout

async function endGiveaway(messageId, channelId, reroll = false) {
  const giveaways = loadGiveaways();
  const g = giveaways[messageId];
  if (!g) return;

  try {
    const channel = await client.channels.fetch(channelId);
    const msg     = await channel.messages.fetch(messageId);

    const reactors = await msg.reactions.cache.get("🎉")?.users.fetch() ?? new Map();
    const eligible = [...reactors.values()].filter((u) => !u.bot);

    if (!eligible.length) {
      await channel.send({ embeds: [
        new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle("🎉 Giveaway Ended")
          .setDescription(`**${g.prize}**\n\nNo valid entries — no winner.`)
          .setTimestamp(),
      ]});
    } else {
      const winner = eligible[Math.floor(Math.random() * eligible.length)];
      await channel.send({ embeds: [
        new EmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle(reroll ? "🔄 Giveaway Rerolled" : "🎉 Giveaway Ended")
          .setDescription(`**${g.prize}**\n\n🏆 Winner: ${winner}\nCongratulations!`)
          .setTimestamp(),
      ]});

      await msg.edit({ embeds: [
        new EmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle("🎉 Giveaway (Ended)")
          .setDescription(`**Prize:** ${g.prize}\n**Winner:** ${winner}\n\nThis giveaway has ended.`)
          .setFooter({ text: `Hosted by ${g.hostedBy}` })
          .setTimestamp(),
      ]});
    }
  } catch (err) {
    console.error("Giveaway end error:", err);
  }

  if (!reroll) {
    delete giveaways[messageId];
    saveGiveaways(giveaways);
    activeGiveaways.delete(messageId);
  }
}

function scheduleGiveaway(messageId, channelId, endsAt) {
  const remaining = endsAt - Date.now();
  if (remaining <= 0) {
    endGiveaway(messageId, channelId);
    return;
  }
  const timeout = setTimeout(() => endGiveaway(messageId, channelId), remaining);
  activeGiveaways.set(messageId, timeout);
}

// ── Verification captchas (in-memory) ───────────────────────────────────────

const pendingVerify = new Map(); // userId -> { answer, expiresAt }

// ── Client setup ─────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// ── Ready ────────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, () => {
  console.log(`Veil Bot ready as ${client.user.tag}`);

  // Restore active giveaways from disk
  const giveaways = loadGiveaways();
  for (const [msgId, g] of Object.entries(giveaways)) {
    scheduleGiveaway(msgId, g.channelId, g.endsAt);
  }
});

// ── Auto-role + welcome ───────────────────────────────────────────────────────

client.on(Events.GuildMemberAdd, async (member) => {
  const cfg = getConfig(member.guild.id);

  if (cfg.memberRoleId) {
    const role = member.guild.roles.cache.get(cfg.memberRoleId);
    if (role) await member.roles.add(role).catch(() => {});
  }

  if (cfg.welcomeChannelId) {
    const channel = member.guild.channels.cache.get(cfg.welcomeChannelId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(VEIL_COLOR)
        .setTitle(`Welcome, ${member.user.username}!`)
        .setDescription(
          cfg.welcomeMessage ||
          `Welcome to **${member.guild.name}**! You're member **#${member.guild.memberCount}**.\n\n` +
          `Check out the server rules and enjoy your stay! 🎉`
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({ text: `Member #${member.guild.memberCount}` })
        .setTimestamp();
      channel.send({ embeds: [embed] }).catch(() => {});
    }
  }
});

// ── Mod log helper ────────────────────────────────────────────────────────────

async function modLog(guild, embed) {
  const cfg = getConfig(guild.id);
  if (!cfg.modLogChannelId) return;
  try {
    const ch = guild.channels.cache.get(cfg.modLogChannelId);
    if (ch) await ch.send({ embeds: [embed] });
  } catch {}
}

// ── Button interactions ───────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  // ── Close ticket ──
  if (interaction.customId === "veil_close_ticket") {
    if (!interaction.channel.isThread()) {
      return interaction.reply({ content: "This can only be used inside a ticket thread.", ephemeral: true });
    }
    try {
      await interaction.reply({ content: "🔒 Closing ticket..." });
      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("Ticket Closed")
        .addFields(
          { name: "Thread",    value: interaction.channel.name, inline: true },
          { name: "Closed by", value: interaction.user.tag,     inline: true },
        )
        .setTimestamp());
      await interaction.channel.setLocked(true);
      await interaction.channel.setArchived(true);
    } catch (err) {
      interaction.followUp({ content: `Error: ${err.message}`, ephemeral: true });
    }
    return;
  }

  // ── Open ticket ──
  if (interaction.customId === "veil_open_ticket") {
    const modal = new ModalBuilder()
      .setCustomId("veil_ticket_modal")
      .setTitle("Open a Support Ticket");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ticket_issue")
          .setLabel("Describe your issue")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(1000)
          .setPlaceholder("What do you need help with?")
      )
    );
    return interaction.showModal(modal);
  }

  // ── Verify button ──
  if (interaction.customId === "veil_verify_user") {
    const cfg = getConfig(interaction.guild.id);
    if (!cfg.verifiedRoleId) {
      return interaction.reply({ content: "Verification role not configured. Ask an admin to run `/set-role verified`.", ephemeral: true });
    }
    if (interaction.member.roles.cache.has(cfg.verifiedRoleId)) {
      return interaction.reply({ content: "You are already verified!", ephemeral: true });
    }

    const a = Math.floor(Math.random() * 20) + 1;
    const b = Math.floor(Math.random() * 20) + 1;
    pendingVerify.set(interaction.user.id, { answer: String(a + b), expiresAt: Date.now() + 5 * 60 * 1000 });

    const modal = new ModalBuilder()
      .setCustomId("veil_verify_modal")
      .setTitle("Verification");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("captcha_answer")
          .setLabel(`What is ${a} + ${b}? (prove you're human)`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(4)
          .setPlaceholder("Type the number")
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("rules_agree")
          .setLabel('Type "I agree" to accept the rules')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(7)
          .setMaxLength(7)
          .setPlaceholder("I agree")
      ),
    );
    return interaction.showModal(modal);
  }
});

// ── Modal submissions ─────────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  // ── Ticket modal ──
  if (interaction.customId === "veil_ticket_modal") {
    const issue   = interaction.fields.getTextInputValue("ticket_issue");
    const cfg     = getConfig(interaction.guild.id);
    const parent  = cfg.ticketsChannelId
      ? interaction.guild.channels.cache.get(cfg.ticketsChannelId)
      : interaction.channel;

    if (!parent || parent.type !== ChannelType.GuildText) {
      return interaction.reply({ content: "Tickets channel not found or not configured. Ask an admin to run `/set-channel tickets`.", ephemeral: true });
    }

    try {
      const thread = await parent.threads.create({
        name: `ticket-${interaction.user.username}`,
        autoArchiveDuration: 10080,
        type: ChannelType.PrivateThread,
        reason: `Support ticket from ${interaction.user.tag}`,
      });

      const staffMention = cfg.staffRoleId ? `<@&${cfg.staffRoleId}>` : "Staff";
      const embed = new EmbedBuilder()
        .setColor(VEIL_COLOR)
        .setTitle("🎫 New Support Ticket")
        .setDescription(issue)
        .addFields({ name: "Opened by", value: `${interaction.user}`, inline: true })
        .setTimestamp();

      const closeBtn = new ButtonBuilder()
        .setCustomId("veil_close_ticket")
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒");

      await thread.send({
        content: `${staffMention} — new ticket from ${interaction.user}`,
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(closeBtn)],
      });

      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(VEIL_COLOR)
        .setTitle("Ticket Opened")
        .addFields(
          { name: "User",   value: interaction.user.tag,  inline: true },
          { name: "Thread", value: thread.name,           inline: true },
        )
        .setTimestamp());

      return interaction.reply({ content: `✅ Ticket opened: ${thread}`, ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `Error creating ticket: ${err.message}`, ephemeral: true });
    }
  }

  // ── Verify modal ──
  if (interaction.customId === "veil_verify_modal") {
    const pending = pendingVerify.get(interaction.user.id);
    if (!pending || Date.now() > pending.expiresAt) {
      pendingVerify.delete(interaction.user.id);
      return interaction.reply({ content: "Verification expired. Click Verify Me again.", ephemeral: true });
    }

    const answer = interaction.fields.getTextInputValue("captcha_answer").trim();
    const agreed = interaction.fields.getTextInputValue("rules_agree").trim().toLowerCase();

    if (answer !== pending.answer) {
      return interaction.reply({ content: "Wrong answer. Click Verify Me to try again.", ephemeral: true });
    }
    if (agreed !== "i agree") {
      return interaction.reply({ content: 'You must type "I agree" exactly. Try again.', ephemeral: true });
    }

    pendingVerify.delete(interaction.user.id);

    const cfg = getConfig(interaction.guild.id);
    try {
      await interaction.member.roles.add(cfg.verifiedRoleId);
      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("User Verified")
        .addFields({ name: "User", value: `${interaction.user.tag}`, inline: true })
        .setTimestamp());
      return interaction.reply({ content: "✅ You're verified! Welcome.", ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `Error adding role: ${err.message}`, ephemeral: true });
    }
  }
});

// ── Slash commands ────────────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const cfg = getConfig(interaction.guild?.id);

  // ══════════════════════════════════════════════════════════
  //  PUBLIC COMMANDS
  // ══════════════════════════════════════════════════════════

  // /veil — show Veil proxy info
  if (commandName === "veil") {
    const embed = new EmbedBuilder()
      .setColor(VEIL_COLOR)
      .setTitle("🌐 Veil Proxy")
      .setDescription(
        "The fastest school proxy — no extensions, no downloads, works on any Chromebook.\n\n" +
        "**Features:**\n" +
        "• Tab cloak — make the tab look like Google Docs, Khan Academy, etc.\n" +
        "• Panic mode — one key turns it into a fake classroom page instantly\n" +
        "• About:blank stealth — no URL showing in the address bar\n" +
        "• 45+ offline games, built-in\n" +
        "• Browse history, search bar, tab manager\n\n" +
        "**Ambassador Program:** Share Veil in a server with 50+ members and get exclusive themes + early access."
      )
      .addFields(
        { name: "🔗 Proxy",   value: "[veilub.mooo.com](https://veilub.mooo.com)",        inline: true },
        { name: "💬 Discord", value: "[discord.gg/NScKEHkd6U](https://discord.gg/NScKEHkd6U)", inline: true },
      )
      .setFooter({ text: "Free forever" })
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  // /status [url]
  if (commandName === "status") {
    await interaction.deferReply();
    const url    = interaction.options.getString("url") || "https://veilub.mooo.com";
    const result = await checkUrl(url);
    const embed  = new EmbedBuilder()
      .setColor(result.online ? 0x22c55e : 0xef4444)
      .setTitle(result.online ? "🟢 Online" : "🔴 Offline")
      .addFields(
        { name: "URL",     value: url,              inline: true },
        { name: "Ping",    value: `${result.ms}ms`, inline: true },
        ...(result.code ? [{ name: "Status", value: String(result.code), inline: true }] : []),
      )
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // /serverinfo
  if (commandName === "serverinfo") {
    await interaction.deferReply();
    const guild = interaction.guild;
    await guild.members.fetch();
    const online = guild.members.cache.filter(
      (m) => m.presence?.status && m.presence.status !== "offline"
    ).size;
    const embed = new EmbedBuilder()
      .setColor(VEIL_COLOR)
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: "👥 Members",  value: `${guild.memberCount}`,                                 inline: true },
        { name: "🟢 Online",   value: `${online}`,                                            inline: true },
        { name: "📅 Created",  value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,   inline: true },
        { name: "🌍 Region",   value: guild.preferredLocale,                                  inline: true },
        { name: "💬 Channels", value: `${guild.channels.cache.size}`,                         inline: true },
        { name: "🎭 Roles",    value: `${guild.roles.cache.size}`,                            inline: true },
      )
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  // /userinfo [user]
  if (commandName === "userinfo") {
    const target = interaction.options.getMember("user") || interaction.member;
    const user   = target.user;
    const roles  = target.roles.cache
      .filter((r) => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `${r}`)
      .slice(0, 10)
      .join(" ") || "None";

    const embed = new EmbedBuilder()
      .setColor(target.displayColor || VEIL_COLOR)
      .setTitle(user.tag)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: "🆔 User ID",    value: user.id,                                                     inline: true },
        { name: "📅 Joined",     value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`,         inline: true },
        { name: "📅 Registered", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:D>`,          inline: true },
        { name: "🎭 Top Role",   value: `${target.roles.highest}`,                                   inline: true },
        { name: "🤖 Bot",        value: user.bot ? "Yes" : "No",                                     inline: true },
        { name: `📋 Roles (${target.roles.cache.size - 1})`, value: roles },
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  // /uptime
  if (commandName === "uptime") {
    const ms      = Date.now() - BOT_START;
    const hours   = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const embed   = new EmbedBuilder()
      .setColor(VEIL_COLOR)
      .setTitle("⏱️ Bot Uptime")
      .setDescription(`**${hours}h ${minutes}m ${seconds}s**`)
      .setFooter({ text: `Started ${new Date(BOT_START).toUTCString()}` });
    return interaction.reply({ embeds: [embed] });
  }

  // /poll
  if (commandName === "poll") {
    const question = interaction.options.getString("question");
    const rawOpts  = [1, 2, 3, 4].map((n) => interaction.options.getString(`option${n}`)).filter(Boolean);

    if (rawOpts.length < 2) {
      return interaction.reply({ content: "You need at least 2 options.", ephemeral: true });
    }

    const EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
    const lines  = rawOpts.map((o, i) => `${EMOJIS[i]} ${o}`).join("\n");

    const embed = new EmbedBuilder()
      .setColor(VEIL_COLOR)
      .setTitle("📊 " + question)
      .setDescription(lines)
      .setFooter({ text: `Poll by ${interaction.user.username}` })
      .setTimestamp();

    const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
    for (let i = 0; i < rawOpts.length; i++) {
      await msg.react(EMOJIS[i]);
    }
    return;
  }

  // /findlink
  if (commandName === "findlink") {
    const glToken = cfg.glApiKey;
    if (!glToken) {
      return interaction.reply({
        content: "This server hasn't set up a glseries API key yet. An admin needs to run `/set-findlink-key` first.\nGet a free key at **live.glseries.net**.",
        ephemeral: true,
      });
    }

    const filterKey      = interaction.options.getString("filter");
    const MONTHLY_LIMIT  = 5;
    const uses           = getFindlinkUses(interaction.user.id);

    if (uses >= MONTHLY_LIMIT) {
      const month = new Date().toLocaleString("en-US", { month: "long" });
      return interaction.reply({
        content: `You've used \`/findlink\` **${uses}/${MONTHLY_LIMIT}** times this month (${month}). Limit resets on the 1st.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    incrementFindlinkUses(interaction.user.id);

    // Fetch domains from FreeDNS
    let allDomains = [];
    try {
      const res  = await fetch("https://freedns.afraid.org/domain/registry/?sort=4&q=");
      const text = await res.text();
      const matches = [...text.matchAll(/href="\/subdomain\/edit\.php\?domain_id=[^"]*"[^>]*>([^<]+)</g)];
      allDomains = matches.map((m) => m[1].trim()).filter(Boolean);
    } catch {
      return interaction.editReply({ content: "Failed to fetch FreeDNS domain list. Try again later." });
    }

    if (!allDomains.length) {
      return interaction.editReply({ content: "Could not fetch domain list from FreeDNS." });
    }

    const pool       = [...allDomains].sort(() => Math.random() - 0.5);
    const MAX_TRIES  = 30;
    const UNCATEG    = /^(uncategor|unknown|unrated|none|n\/a|other|miscellaneous)/i;
    let found = null, checked = 0, filterName = filterKey;

    for (const domain of pool.slice(0, MAX_TRIES)) {
      checked++;
      try {
        let results = getFindlinkCache(domain);
        if (!results) {
          const res  = await fetch(`https://live.glseries.net/api/v1/check?token=${glToken}&url=${encodeURIComponent(domain)}`);
          const data = await res.json();
          if (!data.success) continue;
          results = data.results;
          setFindlinkCache(domain, results);
        }
        const result = results.find((r) => r.filter === filterKey);
        if (result) filterName = result.name;
        const category = result?.category || "";
        if (result && !result.blocked && !result.error && !UNCATEG.test(category)) {
          found = { domain, name: result.name, category };
          break;
        }
      } catch {}
    }

    if (!found) {
      return interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle("No Unblocked Domain Found")
          .setDescription(`Checked **${checked}** domains against **${filterName}** — none passed. Try again for a new batch.`)
          .setTimestamp(),
      ]});
    }

    return interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ Unblocked Domain Found")
        .setDescription(`\`${found.domain}\` is **not blocked** by **${found.name}**`)
        .addFields(
          { name: "Category",     value: found.category || "Unknown", inline: true },
          { name: "Filter",       value: found.name,                  inline: true },
          { name: "Checked",      value: `${checked} domains`,        inline: true },
          {
            name: "Next step",
            value: `Register a subdomain at [FreeDNS](https://freedns.afraid.org/subdomain/edit.php) pointing to your server IP, e.g. \`yourname.${found.domain}\``,
          },
        )
        .setFooter({ text: `${MONTHLY_LIMIT - uses - 1} uses remaining this month` })
        .setTimestamp(),
    ]});
  }

  // ══════════════════════════════════════════════════════════
  //  MOD COMMANDS
  // ══════════════════════════════════════════════════════════

  if (!interaction.guild) return;

  if (["warn", "warnings", "clearwarnings", "purge", "slowmode", "announce", "giveaway"].includes(commandName)) {
    if (!isMod(interaction.member, cfg)) {
      return interaction.reply({ content: "You need the staff role or Manage Messages permission.", ephemeral: true });
    }
  }

  // /warn
  if (commandName === "warn") {
    const target = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason");
    if (!target) return interaction.reply({ content: "User not found.", ephemeral: true });
    if (target.id === interaction.user.id) return interaction.reply({ content: "You can't warn yourself.", ephemeral: true });

    const warning = { reason, by: interaction.user.tag, at: new Date().toISOString() };
    addWarning(interaction.guild.id, target.id, warning);
    const count = getWarnings(interaction.guild.id, target.id).length;

    try {
      await target.send({ embeds: [
        new EmbedBuilder()
          .setColor(0xf59e0b)
          .setTitle(`⚠️ Warning — ${interaction.guild.name}`)
          .setDescription(`You received a warning.\n\n**Reason:** ${reason}\n**Warned by:** ${interaction.user.username}`)
          .setFooter({ text: `Warning ${count} on your account` })
          .setTimestamp(),
      ]});
    } catch {}

    await modLog(interaction.guild, new EmbedBuilder()
      .setColor(0xf59e0b)
      .setTitle("Warning Issued")
      .addFields(
        { name: "User",   value: `${target.user.tag} (${target.id})`, inline: true },
        { name: "By",     value: interaction.user.tag,                inline: true },
        { name: "Reason", value: reason },
        { name: "Total",  value: `${count} warning(s)`,               inline: true },
      )
      .setTimestamp());

    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("⚠️ Warning Issued")
        .addFields(
          { name: "User",   value: `${target}`,    inline: true },
          { name: "Reason", value: reason,          inline: true },
          { name: "Total",  value: `${count}`,      inline: true },
        )
        .setTimestamp(),
    ]});
  }

  // /warnings
  if (commandName === "warnings") {
    const target   = interaction.options.getMember("user");
    if (!target) return interaction.reply({ content: "User not found.", ephemeral: true });
    const list     = getWarnings(interaction.guild.id, target.id);
    const embed    = new EmbedBuilder()
      .setColor(list.length ? 0xf59e0b : 0x22c55e)
      .setTitle(`⚠️ Warnings — ${target.user.username}`)
      .setDescription(
        list.length
          ? list.map((w, i) => `**${i + 1}.** ${w.reason}\n> by ${w.by} · <t:${Math.floor(new Date(w.at).getTime() / 1000)}:R>`).join("\n\n")
          : "No warnings."
      )
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // /clearwarnings
  if (commandName === "clearwarnings") {
    const target = interaction.options.getMember("user");
    if (!target) return interaction.reply({ content: "User not found.", ephemeral: true });
    clearWarnings(interaction.guild.id, target.id);
    await modLog(interaction.guild, new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle("Warnings Cleared")
      .addFields(
        { name: "User", value: target.user.tag,    inline: true },
        { name: "By",   value: interaction.user.tag, inline: true },
      )
      .setTimestamp());
    return interaction.reply({ content: `✅ All warnings cleared for ${target}.`, ephemeral: true });
  }

  // /purge
  if (commandName === "purge") {
    const amount = interaction.options.getInteger("amount");
    if (amount < 1 || amount > 100) return interaction.reply({ content: "Amount must be between 1 and 100.", ephemeral: true });
    try {
      await interaction.deferReply({ ephemeral: true });
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await modLog(interaction.guild, new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle("Messages Purged")
        .addFields(
          { name: "Count",   value: `${deleted.size}`, inline: true },
          { name: "Channel", value: `${interaction.channel}`, inline: true },
          { name: "By",      value: interaction.user.tag,  inline: true },
        )
        .setTimestamp());
      return interaction.editReply({ content: `🗑️ Deleted **${deleted.size}** messages.` });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }

  // /slowmode
  if (commandName === "slowmode") {
    const seconds = interaction.options.getInteger("seconds");
    try {
      await interaction.channel.setRateLimitPerUser(seconds);
      return interaction.reply({
        content: seconds === 0 ? "✅ Slowmode disabled." : `✅ Slowmode set to **${seconds}s**.`,
        ephemeral: true,
      });
    } catch (err) {
      return interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
  }

  // /announce
  if (commandName === "announce") {
    const title    = interaction.options.getString("title");
    const message  = interaction.options.getString("message");
    const ping     = interaction.options.getBoolean("ping") ?? false;
    const target   = interaction.options.getChannel("channel") || interaction.channel;

    const embed = new EmbedBuilder()
      .setColor(VEIL_COLOR)
      .setTitle("📣 " + title)
      .setDescription(message)
      .setFooter({ text: `Posted by ${interaction.user.username}` })
      .setTimestamp();

    try {
      await target.send({ content: ping ? "@everyone" : undefined, embeds: [embed] });
      return interaction.reply({ content: `✅ Announcement posted in ${target}.`, ephemeral: true });
    } catch (err) {
      return interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
  }

  // /giveaway
  if (commandName === "giveaway") {
    const sub = interaction.options.getSubcommand();

    if (sub === "start") {
      const durationStr = interaction.options.getString("duration");
      const prize       = interaction.options.getString("prize");
      const channel     = interaction.options.getChannel("channel") || interaction.channel;
      const ms          = parseDuration(durationStr);

      if (!ms) return interaction.reply({ content: "Invalid duration. Use formats like `30m`, `1h`, `1d`, `1w`.", ephemeral: true });

      const endsAt = Date.now() + ms;
      const embed  = new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle("🎉 Giveaway!")
        .setDescription(
          `**Prize:** ${prize}\n\nReact with 🎉 to enter!\n\n` +
          `**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`
        )
        .setFooter({ text: `Hosted by ${interaction.user.username} · Duration: ${formatDuration(ms)}` })
        .setTimestamp(endsAt);

      const msg = await channel.send({ embeds: [embed] });
      await msg.react("🎉");

      const giveaways = loadGiveaways();
      giveaways[msg.id] = { prize, channelId: channel.id, endsAt, hostedBy: interaction.user.username };
      saveGiveaways(giveaways);
      scheduleGiveaway(msg.id, channel.id, endsAt);

      return interaction.reply({ content: `✅ Giveaway started in ${channel}!`, ephemeral: true });
    }

    if (sub === "end") {
      const messageId = interaction.options.getString("message_id");
      const giveaways = loadGiveaways();
      if (!giveaways[messageId]) return interaction.reply({ content: "No active giveaway with that message ID.", ephemeral: true });

      const channelId = giveaways[messageId].channelId;
      clearTimeout(activeGiveaways.get(messageId));
      activeGiveaways.delete(messageId);
      await endGiveaway(messageId, channelId);
      return interaction.reply({ content: "✅ Giveaway ended.", ephemeral: true });
    }

    if (sub === "reroll") {
      const messageId = interaction.options.getString("message_id");
      const giveaways = loadGiveaways();
      const g         = giveaways[messageId];
      if (!g) return interaction.reply({ content: "No giveaway found with that message ID.", ephemeral: true });
      await endGiveaway(messageId, g.channelId, true);
      return interaction.reply({ content: "✅ Winner rerolled.", ephemeral: true });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  ADMIN COMMANDS
  // ══════════════════════════════════════════════════════════

  if (["set-channel", "set-role", "viewconfig", "setuptickets", "setupverify", "livestatus", "set-welcome-message", "set-findlink-key"].includes(commandName)) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "You need Administrator permission to use this command.", ephemeral: true });
    }
  }

  // /set-channel
  if (commandName === "set-channel") {
    const type    = interaction.options.getString("type");
    const channel = interaction.options.getChannel("channel");
    const keyMap  = {
      welcome:       "welcomeChannelId",
      "mod-log":     "modLogChannelId",
      tickets:       "ticketsChannelId",
      announcements: "announcementsChannelId",
    };
    setConfig(interaction.guild.id, { [keyMap[type]]: channel.id });
    return interaction.reply({ content: `✅ **${type}** channel set to ${channel}.`, ephemeral: true });
  }

  // /set-role
  if (commandName === "set-role") {
    const type   = interaction.options.getString("type");
    const role   = interaction.options.getRole("role");
    const keyMap = {
      member:   "memberRoleId",
      verified: "verifiedRoleId",
      staff:    "staffRoleId",
    };
    setConfig(interaction.guild.id, { [keyMap[type]]: role.id });
    return interaction.reply({ content: `✅ **${type}** role set to ${role}.`, ephemeral: true });
  }

  // /set-welcome-message
  if (commandName === "set-welcome-message") {
    const message = interaction.options.getString("message");
    setConfig(interaction.guild.id, { welcomeMessage: message });
    return interaction.reply({ content: "✅ Welcome message updated.", ephemeral: true });
  }

  // /set-findlink-key
  if (commandName === "set-findlink-key") {
    const key = interaction.options.getString("key");
    setConfig(interaction.guild.id, { glApiKey: key });
    return interaction.reply({ content: "✅ glseries API key saved. `/findlink` is now enabled for this server.", ephemeral: true });
  }

  // /viewconfig
  if (commandName === "viewconfig") {
    const c     = getConfig(interaction.guild.id);
    const ch    = (id) => id ? `<#${id}>` : "Not set";
    const role  = (id) => id ? `<@&${id}>` : "Not set";
    const embed = new EmbedBuilder()
      .setColor(VEIL_COLOR)
      .setTitle("⚙️ Bot Config")
      .addFields(
        { name: "Welcome Channel",       value: ch(c.welcomeChannelId),       inline: true },
        { name: "Mod Log",               value: ch(c.modLogChannelId),         inline: true },
        { name: "Tickets Channel",       value: ch(c.ticketsChannelId),        inline: true },
        { name: "Announcements Channel", value: ch(c.announcementsChannelId),  inline: true },
        { name: "Member Role",           value: role(c.memberRoleId),          inline: true },
        { name: "Verified Role",         value: role(c.verifiedRoleId),        inline: true },
        { name: "Staff Role",            value: role(c.staffRoleId),           inline: true },
        { name: "Welcome Message",       value: c.welcomeMessage ? "Custom ✅" : "Default", inline: true },
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // /setuptickets
  if (commandName === "setuptickets") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const embed = new EmbedBuilder()
        .setColor(VEIL_COLOR)
        .setTitle("🎫 Support Tickets")
        .setDescription(
          "Need help? Click below to open a private support ticket.\n" +
          "Describe your issue and a staff member will assist you."
        );
      const btn = new ButtonBuilder()
        .setCustomId("veil_open_ticket")
        .setLabel("Open a Ticket")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎫");
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return interaction.editReply({ content: "✅ Ticket panel posted." });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }

  // /setupverify
  if (commandName === "setupverify") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const embed = new EmbedBuilder()
        .setColor(VEIL_COLOR)
        .setTitle("✅ Verify to access the server")
        .setDescription(
          "Click below to verify your account and gain access.\n" +
          "By verifying you agree to follow the server rules."
        );
      const btn = new ButtonBuilder()
        .setCustomId("veil_verify_user")
        .setLabel("Verify Me")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✅");
      await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
      return interaction.editReply({ content: "✅ Verification panel posted." });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }

  // /livestatus
  if (commandName === "livestatus") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const url    = interaction.options.getString("url") || "https://veilub.mooo.com";
      const result = await checkUrl(url);
      const embed  = new EmbedBuilder()
        .setColor(result.online ? 0x22c55e : 0xef4444)
        .setTitle("🌐 Live Status")
        .addFields(
          { name: "URL",     value: url,                                      inline: true },
          { name: "Status",  value: result.online ? "🟢 Online" : "🔴 Offline", inline: true },
          { name: "Ping",    value: `${result.ms}ms`,                          inline: true },
        )
        .setFooter({ text: "Updates every 60 seconds" })
        .setTimestamp();

      const msg = await interaction.channel.send({ embeds: [embed] });
      setConfig(interaction.guild.id, {
        liveStatusChannelId: interaction.channel.id,
        liveStatusMessageId: msg.id,
        liveStatusUrl:       url,
      });

      // Start/continue auto-refresh for this guild
      return interaction.editReply({ content: "✅ Live status embed posted. It will update every 60s." });
    } catch (err) {
      return interaction.editReply({ content: `Error: ${err.message}` });
    }
  }
});

// ── Live status refresh ───────────────────────────────────────────────────────

setInterval(async () => {
  const all = load(CONFIGS_FILE, {});
  for (const [, cfg] of Object.entries(all)) {
    if (!cfg.liveStatusChannelId || !cfg.liveStatusMessageId) continue;
    try {
      const url    = cfg.liveStatusUrl || "https://veilub.mooo.com";
      const result = await checkUrl(url);
      const ch     = await client.channels.fetch(cfg.liveStatusChannelId);
      const msg    = await ch.messages.fetch(cfg.liveStatusMessageId);
      await msg.edit({ embeds: [
        new EmbedBuilder()
          .setColor(result.online ? 0x22c55e : 0xef4444)
          .setTitle("🌐 Live Status")
          .addFields(
            { name: "URL",    value: url,                                        inline: true },
            { name: "Status", value: result.online ? "🟢 Online" : "🔴 Offline", inline: true },
            { name: "Ping",   value: `${result.ms}ms`,                            inline: true },
          )
          .setFooter({ text: "Updates every 60 seconds" })
          .setTimestamp(),
      ]});
    } catch {}
  }
}, 60_000);

client.login(process.env.DISCORD_TOKEN);
