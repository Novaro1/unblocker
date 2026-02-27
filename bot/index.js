import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LINKS_FILE = join(__dirname, "links.json");

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
  SERVER_URL = "https://veilub.mooo.com",
} = process.env;

client.once(Events.ClientReady, () => {
  console.log(`Veil Bot ready as ${client.user.tag}`);
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
});

client.login(DISCORD_TOKEN);
