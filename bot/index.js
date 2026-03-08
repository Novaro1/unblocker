import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import https from "https";

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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const {
  DISCORD_TOKEN,
  MEMBER_ROLE_ID,
  WELCOME_CHANNEL_ID,
  ANNOUNCEMENTS_CHANNEL_ID,
  VERIFIED_ROLE_ID,
  SERVER_URL = "https://veilub.mooo.com",
} = process.env;

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

client.once(Events.ClientReady, () => {
  console.log(`Veil Bot ready as ${client.user.tag}`);
  // Refresh live embeds every 60 seconds
  setInterval(refreshLiveMessages, 60_000);
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
        .setTitle("Welcome to Veil!")
        .setDescription(
          `Hey ${member}! Welcome to the server.\n\n` +
          `Check **#links** for working proxy links and **#faq** if you have questions.`
        )
        .setThumbnail(member.user.displayAvatarURL());
      channel.send({ embeds: [embed] });
    }
  }
});

// ── Button interactions ────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === "verify_user") {
    if (!VERIFIED_ROLE_ID) {
      return interaction.reply({ content: "VERIFIED_ROLE_ID is not set in the bot .env file.", ephemeral: true });
    }
    const role = interaction.guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!role) {
      return interaction.reply({ content: "Verified role not found. Check VERIFIED_ROLE_ID in .env.", ephemeral: true });
    }
    if (interaction.member.roles.cache.has(VERIFIED_ROLE_ID)) {
      return interaction.reply({ content: "You are already verified!", ephemeral: true });
    }
    try {
      await interaction.member.roles.add(role);
      return interaction.reply({
        content: "✅ You have been verified! Welcome to Veil.",
        ephemeral: true,
      });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
    }
  }
});

// ── Slash commands ─────────────────────────────────────────────────────────
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

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
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("📣 Veil Update")
      .setDescription(message)
      .setTimestamp()
      .setFooter({ text: `Posted by ${interaction.user.username}` });
    await channel.send({ content: "@everyone", embeds: [embed] });
    return interaction.reply({ content: "Announcement posted!", ephemeral: true });
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
      .setTitle("Welcome to Veil!")
      .setDescription(
        `Hey ${interaction.user}! Welcome to the server.\n\n` +
        `Check **#links** for working proxy links and **#faq** if you have questions.`
      )
      .setThumbnail(interaction.user.displayAvatarURL());
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
      return interaction.reply({
        content: `✅ Ambassador token generated and DMed to **${target.username}**.`,
        ephemeral: true,
      });
    } catch {
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
