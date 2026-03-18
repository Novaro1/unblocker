import "dotenv/config";
import { REST, Routes, ApplicationCommandOptionType } from "discord.js";

const { DISCORD_TOKEN, DISCORD_CLIENT_ID } = process.env;

const commands = [
  // ── Public ──────────────────────────────────────────────────────────────
  {
    name: "veil",
    description: "Get the Veil proxy link and features",
  },
  {
    name: "status",
    description: "Check if a URL is online",
    options: [
      {
        name: "url",
        description: "URL to check (default: Veil proxy)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    name: "serverinfo",
    description: "Show server stats",
  },
  {
    name: "userinfo",
    description: "Show info about a user",
    options: [
      {
        name: "user",
        description: "The user to look up (default: yourself)",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },
  {
    name: "uptime",
    description: "Show how long the bot has been running",
  },
  {
    name: "poll",
    description: "Create a poll with up to 4 options",
    options: [
      { name: "question", description: "The poll question",  type: ApplicationCommandOptionType.String, required: true },
      { name: "option1",  description: "Option 1",           type: ApplicationCommandOptionType.String, required: true },
      { name: "option2",  description: "Option 2",           type: ApplicationCommandOptionType.String, required: true },
      { name: "option3",  description: "Option 3 (optional)",type: ApplicationCommandOptionType.String, required: false },
      { name: "option4",  description: "Option 4 (optional)",type: ApplicationCommandOptionType.String, required: false },
    ],
  },
  {
    name: "findlink",
    description: "Find a FreeDNS domain that passes your school filter (5 uses/month)",
    options: [
      {
        name: "filter",
        description: "Your school filter ID from live.glseries.net",
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: "GoGuardian",       value: "goguardian" },
          { name: "Securly",          value: "securly" },
          { name: "Lightspeed",       value: "lightspeed" },
          { name: "Bark",             value: "bark" },
          { name: "iBoss",            value: "iboss" },
          { name: "ContentKeeper",    value: "contentkeeper" },
          { name: "Cisco Umbrella",   value: "cisco_umbrella" },
          { name: "Fortiguard",       value: "fortiguard" },
          { name: "Smoothwall",       value: "smoothwall" },
          { name: "Zscaler",          value: "zscaler" },
        ],
      },
    ],
  },

  // ── Mod ──────────────────────────────────────────────────────────────────
  {
    name: "warn",
    description: "Warn a user [Mod]",
    options: [
      { name: "user",   description: "User to warn",       type: ApplicationCommandOptionType.User,   required: true },
      { name: "reason", description: "Reason for the warn",type: ApplicationCommandOptionType.String, required: true },
    ],
  },
  {
    name: "warnings",
    description: "View warnings for a user [Mod]",
    options: [
      { name: "user", description: "User to check", type: ApplicationCommandOptionType.User, required: true },
    ],
  },
  {
    name: "clearwarnings",
    description: "Clear all warnings for a user [Mod]",
    options: [
      { name: "user", description: "User to clear", type: ApplicationCommandOptionType.User, required: true },
    ],
  },
  {
    name: "purge",
    description: "Delete multiple messages (max 100) [Mod]",
    options: [
      {
        name: "amount",
        description: "Number of messages to delete (1–100)",
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 1,
        max_value: 100,
      },
    ],
  },
  {
    name: "slowmode",
    description: "Set slowmode on this channel [Mod]",
    options: [
      {
        name: "seconds",
        description: "Slowmode in seconds (0 = off)",
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 0,
        max_value: 21600,
      },
    ],
  },
  {
    name: "announce",
    description: "Post a formatted announcement [Mod]",
    options: [
      { name: "title",   description: "Announcement title",            type: ApplicationCommandOptionType.String,  required: true },
      { name: "message", description: "Announcement body",             type: ApplicationCommandOptionType.String,  required: true },
      { name: "channel", description: "Channel to post in (default: here)", type: ApplicationCommandOptionType.Channel, required: false },
      { name: "ping",    description: "Ping @everyone? (default: false)",    type: ApplicationCommandOptionType.Boolean, required: false },
    ],
  },
  {
    name: "giveaway",
    description: "Manage giveaways [Mod]",
    options: [
      {
        name: "start",
        description: "Start a new giveaway",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: "duration", description: "Duration e.g. 30m, 1h, 1d, 1w", type: ApplicationCommandOptionType.String,  required: true },
          { name: "prize",    description: "What are you giving away?",       type: ApplicationCommandOptionType.String,  required: true },
          { name: "channel",  description: "Channel to post in (default: here)", type: ApplicationCommandOptionType.Channel, required: false },
        ],
      },
      {
        name: "end",
        description: "End a giveaway early and pick a winner",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: "message_id", description: "Message ID of the giveaway", type: ApplicationCommandOptionType.String, required: true },
        ],
      },
      {
        name: "reroll",
        description: "Reroll the winner of a finished giveaway",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          { name: "message_id", description: "Message ID of the giveaway", type: ApplicationCommandOptionType.String, required: true },
        ],
      },
    ],
  },

  // ── Admin ────────────────────────────────────────────────────────────────
  {
    name: "set-channel",
    description: "Set a bot channel [Admin]",
    options: [
      {
        name: "type",
        description: "Which channel to set",
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: "Welcome",       value: "welcome" },
          { name: "Mod Log",       value: "mod-log" },
          { name: "Tickets",       value: "tickets" },
          { name: "Announcements", value: "announcements" },
        ],
      },
      {
        name: "channel",
        description: "The channel",
        type: ApplicationCommandOptionType.Channel,
        required: true,
      },
    ],
  },
  {
    name: "set-role",
    description: "Set a bot role [Admin]",
    options: [
      {
        name: "type",
        description: "Which role to set",
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: "Member (auto-assigned on join)",    value: "member" },
          { name: "Verified (given after captcha)",    value: "verified" },
          { name: "Staff (can use mod commands)",      value: "staff" },
        ],
      },
      {
        name: "role",
        description: "The role",
        type: ApplicationCommandOptionType.Role,
        required: true,
      },
    ],
  },
  {
    name: "ai-scan",
    description: "Manually run an AI scan of recent server messages [Mod]",
  },
  {
    name: "setup-ai-monitor",
    description: "Set up the AI server monitor — opens a setup form [Admin]",
  },
  {
    name: "ai-monitor-stop",
    description: "Stop the AI monitor and clear its config [Admin]",
  },
  {
    name: "set-findlink-key",
    description: "Set your glseries.net API key to enable /findlink [Admin]",
    options: [
      {
        name: "key",
        description: "Your glseries API key (get one at live.glseries.net)",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    name: "set-welcome-message",
    description: "Set a custom welcome message [Admin]",
    options: [
      {
        name: "message",
        description: "Welcome message text (supports {user} and {server} placeholders)",
        type: ApplicationCommandOptionType.String,
        required: true,
        max_length: 1000,
      },
    ],
  },
  {
    name: "viewconfig",
    description: "View the bot's current configuration for this server [Admin]",
  },
  {
    name: "setuptickets",
    description: "Post the ticket panel in this channel [Admin]",
  },
  {
    name: "setupverify",
    description: "Post the verification panel in this channel [Admin]",
  },
  {
    name: "livestatus",
    description: "Post a live status embed that auto-updates every 60s [Admin]",
    options: [
      {
        name: "url",
        description: "URL to monitor (default: Veil proxy)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

try {
  console.log(`Registering ${commands.length} global slash commands...`);
  await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
  console.log("Done.");
} catch (err) {
  console.error(err);
}
