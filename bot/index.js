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
  return new EmbedBuilder()
    .setColor(0x6366f1)
    .setTitle("🔗 Working Veil Links")
    .setDescription(
      links.length
        ? links.map((l, i) => `${i + 1}. [${l.name}](${l.url})`).join("\n")
        : "No links yet. Staff can add one with `/addlink`."
    )
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
    const links = loadLinks();
    if (links.length === 0) {
      return interaction.reply({
        content: "No links added yet. Staff can add one with `/addlink`.",
        ephemeral: true,
      });
    }
    const embed = new EmbedBuilder()
      .setColor(0x6366f1)
      .setTitle("Working Veil Links")
      .setDescription(links.map((l, i) => `${i + 1}. [${l.name}](${l.url})`).join("\n"))
      .setFooter({ text: "First load may take a few seconds while the SSL cert is issued." });
    return interaction.reply({ embeds: [embed] });
  }

  // /addlink
  if (commandName === "addlink") {
    const url  = interaction.options.getString("url");
    const name = interaction.options.getString("name") || url;
    const links = loadLinks();
    if (links.find((l) => l.url === url)) {
      return interaction.reply({ content: "That link is already in the list.", ephemeral: true });
    }
    links.push({ url, name });
    saveLinks(links);
    refreshLiveMessages();
    return interaction.reply({ content: `Added **${name}** to the links list.` });
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
        "You're on `http://` instead of `https://`. The proxy requires a secure connection. " +
        "Make sure your link starts with `https://`.",
      slow:
        "**Site is Slow**\n" +
        "The server is shared by everyone. Try enabling **Lag Reduction** in Settings. " +
        "Peak hours will be slower.",
      blocked:
        "**Site Won't Load**\n" +
        "Some sites actively block proxies. Google, YouTube, Discord, and most social media work fine. " +
        "Streaming sites like Netflix are blocked by design.",
      link:
        "**Make Your Own Link**\n" +
        "1. Go to freedns.afraid.org → create a free account\n" +
        "2. Subdomains → Add\n" +
        "3. Type: `A` | Subdomain: anything | pick a domain | Destination: (see #links)\n" +
        "4. Save and wait ~2 minutes\n" +
        "5. Visit `https://yourname.domain.com`\n" +
        "Post it in #submit-a-link so others can use it!",
      history:
        "**History & Privacy**\n" +
        "History is stored only on your own device in local storage. " +
        "Nothing is sent to or stored on the server. " +
        "You can turn it off or clear it in Settings → Privacy.",
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
