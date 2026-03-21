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
    )
    .addUserOption((o) =>
      o.setName("submitter").setDescription("Who found or submitted this link?").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("unblocked").setDescription("Filters it works on, comma-separated (e.g. GoGuardian, Securly, Lightspeed)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("updatelink")
    .setDescription("Update filter info or submitter on an existing link (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("url").setDescription("The exact URL of the link to update").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("unblocked").setDescription("Filters it works on, comma-separated (replaces existing)").setRequired(false)
    )
    .addUserOption((o) =>
      o.setName("submitter").setDescription("Update who submitted this link").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("name").setDescription("Update the display name").setRequired(false)
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
          { name: "History & privacy",               value: "history" },
          { name: "Ambassador program",              value: "ambassador" }
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
    )
    .addBooleanOption((o) =>
      o.setName("ping").setDescription("Ping @everyone? (default: true)").setRequired(false)
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

  new SlashCommandBuilder()
    .setName("verify-user")
    .setDescription("Manually verify a user (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to verify").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unverify-user")
    .setDescription("Revoke a user's verification (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to unverify").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("approve-ad")
    .setDescription("Grant a user an ambassador token for advertising Veil (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to reward").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("revoke-ad")
    .setDescription("Revoke a user's ambassador token (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to revoke").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("beta-release")
    .setDescription("Add a new feature to the beta (ambassador-only) window (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("type").setDescription("Feature type").setRequired(true)
        .addChoices(
          { name: "Theme",    value: "theme"    },
          { name: "Gradient", value: "gradient" },
          { name: "Cloak",    value: "cloak"    },
        )
    )
    .addStringOption((o) =>
      o.setName("key").setDescription("The data key (e.g. hologram, blaze, youtube)").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("label").setDescription("Display name (e.g. Hologram)").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("days").setDescription("Days in ambassador-only beta window (default 14)").setRequired(false)
        .setMinValue(1).setMaxValue(365)
    ),

  new SlashCommandBuilder()
    .setName("beta-status")
    .setDescription("Show current beta features and their ambassador-only countdown"),

  new SlashCommandBuilder()
    .setName("award-points")
    .setDescription("Award leaderboard points to an ambassador (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addUserOption((o) =>
      o.setName("user").setDescription("The ambassador to award").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("points").setDescription("Points to award (use negative to deduct)").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Why are you awarding these points?").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top Veil ambassadors"),

  new SlashCommandBuilder()
    .setName("freedns")
    .setDescription("Pick random public FreeDNS domains to use for a Veil link")
    .addIntegerOption((o) =>
      o.setName("count").setDescription("How many to show (default 5, max 20)").setRequired(false)
        .setMinValue(1).setMaxValue(20)
    ),

  new SlashCommandBuilder()
    .setName("setuptickets")
    .setDescription("Post the ticket panel with an Open a Ticket button in this channel (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("makelink")
    .setDescription("Auto-create a FreeDNS subdomain pointing to the proxy (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("subdomain").setDescription("Custom subdomain name (e.g. veil2024) — random if omitted").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("filter").setDescription("Only use a domain unblocked by this content filter").setRequired(false)
        .addChoices(
          { name: "GoGuardian",     value: "goguardian"    },
          { name: "Securly",        value: "securly"       },
          { name: "Lightspeed",     value: "lightspeed"    },
          { name: "Cisco Umbrella", value: "cisco"         },
          { name: "iBoss",          value: "iboss"         },
          { name: "Barracuda",      value: "barracuda"     },
          { name: "DNSFilter",      value: "dnsfilter"     },
          { name: "FortiGuard",     value: "fortiguard"    },
          { name: "Linewize",       value: "linewize"      },
          { name: "Blocksi Web",    value: "blocksiweb"    },
          { name: "Blocksi AI",     value: "blocksiai"     },
          { name: "Deledao",        value: "deledao"       },
          { name: "AristotleK12",   value: "aristotle"     },
          { name: "Senso Cloud",    value: "senso"         },
          { name: "Palo Alto",      value: "paloalto"      },
          { name: "LanSchool",      value: "lanschool"     },
          { name: "Qustodio",       value: "qustodio"      },
          { name: "Sophos",         value: "sophos"        },
          { name: "ContentKeeper",  value: "contentkeeper" },
        )
    )
    .addStringOption((o) =>
      o.setName("domain").setDescription("FreeDNS shared domain to use (e.g. mooo.com, chickenkiller.com) — use /freedns to find options").setRequired(false)
    )
    .addBooleanOption((o) =>
      o.setName("skip_uncategorized").setDescription("Skip domains with no known category (default: true)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ai-scan")
    .setDescription("Manually trigger an AI scan of recent server messages (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("findlink")
    .setDescription("Find a FreeDNS domain that is unblocked by a specific school content filter")
    .addStringOption((o) =>
      o.setName("filter").setDescription("Which filter to check against").setRequired(true)
        .addChoices(
          { name: "GoGuardian",     value: "goguardian"    },
          { name: "Securly",        value: "securly"       },
          { name: "Lightspeed",     value: "lightspeed"    },
          { name: "Cisco Umbrella", value: "cisco"         },
          { name: "iBoss",          value: "iboss"         },
          { name: "Barracuda",      value: "barracuda"     },
          { name: "DNSFilter",      value: "dnsfilter"     },
          { name: "FortiGuard",     value: "fortiguard"    },
          { name: "Linewize",       value: "linewize"      },
          { name: "Blocksi Web",    value: "blocksiweb"    },
          { name: "Blocksi AI",     value: "blocksiai"     },
          { name: "Deledao",        value: "deledao"       },
          { name: "AristotleK12",   value: "aristotle"     },
          { name: "Senso Cloud",    value: "senso"         },
          { name: "Palo Alto",      value: "paloalto"      },
          { name: "LanSchool",      value: "lanschool"     },
          { name: "Qustodio",       value: "qustodio"      },
          { name: "Sophos",         value: "sophos"        },
          { name: "ContentKeeper",  value: "contentkeeper" },
        )
    )
    .addBooleanOption((o) =>
      o.setName("skip_uncategorized").setDescription("Skip domains with no known category (default: true)").setRequired(false)
    ),
].map((c) => c.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);

rest
  .put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands })
  .then(() => console.log("Slash commands registered!"))
  .catch(console.error);
