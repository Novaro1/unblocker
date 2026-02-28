// Run this once to register slash commands with Discord:
//   node deploy.js
import "dotenv/config";
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

const commands = [
  new SlashCommandBuilder()
    .setName("links")
    .setDescription("Show all working Veil proxy links"),

  new SlashCommandBuilder()
    .setName("addlink")
    .setDescription("Add a working link (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("url").setDescription("The full link URL (https://...)").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("name").setDescription("Display name e.g. veilub.mooo.com").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("removelink")
    .setDescription("Remove a link from the list (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("url").setDescription("The full link URL to remove").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Check if the Veil server is online"),

  new SlashCommandBuilder()
    .setName("faq")
    .setDescription("Get answers to common questions")
    .addStringOption((o) =>
      o
        .setName("topic")
        .setDescription("Pick a topic")
        .setRequired(false)
        .addChoices(
          { name: "Scramjet / service worker error", value: "error"   },
          { name: "Site is slow",                    value: "slow"    },
          { name: "Site won't load",                 value: "blocked" },
          { name: "Make your own link",              value: "link"    },
          { name: "History & privacy",               value: "history" }
        )
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Show Veil Discord server stats and proxy status"),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post an update to the announcements channel (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("message").setDescription("The announcement text").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("testwelcome")
    .setDescription("Send a test welcome message to the welcome channel (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Show how long the bot has been running"),

  new SlashCommandBuilder()
    .setName("livestatus")
    .setDescription("Post a live auto-updating server status embed in this channel (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("livelinks")
    .setDescription("Post a live auto-updating links embed in this channel (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("setupverify")
    .setDescription("Post the verification button in this channel (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map((c) => c.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);

rest
  .put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands })
  .then(() => console.log("Slash commands registered!"))
  .catch(console.error);
