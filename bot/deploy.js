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
    .setDescription("Add a working link — auto-checks which school filters it bypasses")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("url").setDescription("The full link URL (https://...)").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("name").setDescription("Display name e.g. secure.brightpathlearning.website").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("type").setDescription("Link type").setRequired(false)
        .addChoices(
          { name: "Full (proxy + music + AI + remote)", value: "full" },
          { name: "Static (games + launcher only)", value: "static" },
        )
    )
    .addUserOption((o) =>
      o.setName("submitter").setDescription("Who found or submitted this link?").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("updatelink")
    .setDescription("Edit a specific link (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("url").setDescription("The exact URL of the link to update").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("name").setDescription("Update the display name").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("type").setDescription("Change link type").setRequired(false)
        .addChoices(
          { name: "Full (proxy + music + AI + remote)", value: "full" },
          { name: "Static (games + launcher only)", value: "static" },
        )
    )
    .addStringOption((o) =>
      o.setName("unblocked").setDescription("Filters it works on, comma-separated (replaces existing)").setRequired(false)
    )
    .addUserOption((o) =>
      o.setName("submitter").setDescription("Update who submitted this link").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("bulkedit")
    .setDescription("Bulk edit links whose URL contains a keyword (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("contains").setDescription("Match links whose URL contains this (e.g. surge.sh, run.app)").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("type").setDescription("Set type for all matching links").setRequired(false)
        .addChoices(
          { name: "Full (proxy + music + AI + remote)", value: "full" },
          { name: "Static (games + launcher only)", value: "static" },
        )
    )
    .addStringOption((o) =>
      o.setName("name_prefix").setDescription("Set name prefix for matching links (e.g. 'Veil Static')").setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("unblocked").setDescription("Set filters for all matching links, comma-separated").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("removelink")
    .setDescription("Remove a link from the list (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o.setName("url").setDescription("The full link URL to remove").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("cleanlinks")
    .setDescription("Check all links and remove dead ones (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addBooleanOption((o) =>
      o.setName("dry_run").setDescription("Preview dead links without removing them (default: false)").setRequired(false)
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
    .setDescription("Instructions for creating a FreeDNS subdomain via the browser extension (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("ai-scan")
    .setDescription("Manually trigger an AI scan of recent server messages (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("makelink-status")
    .setDescription("Show how many FreeDNS accounts are configured and their subdomain capacity (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("addfreedns")
    .setDescription("Add a FreeDNS account to the subdomain creation pool (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("searchlinks")
    .setDescription("Search existing links that work on your school's filter")
    .addStringOption((o) =>
      o.setName("filter").setDescription("Your school's content filter").setRequired(true)
        .addChoices(
          { name: "GoGuardian",     value: "GoGuardian"    },
          { name: "Securly",        value: "Securly"       },
          { name: "Lightspeed",     value: "Lightspeed"    },
          { name: "Cisco Umbrella", value: "Cisco Umbrella"},
          { name: "iBoss",          value: "iBoss"         },
          { name: "Barracuda",      value: "Barracuda"     },
          { name: "DNSFilter",      value: "DNSFilter"     },
          { name: "FortiGuard",     value: "FortiGuard"    },
          { name: "Linewize",       value: "Linewize"      },
          { name: "Blocksi Web",    value: "Blocksi Web"   },
          { name: "Blocksi AI",     value: "Blocksi AI"    },
          { name: "Deledao",        value: "Deledao"       },
          { name: "Senso Cloud",    value: "Senso Cloud"   },
          { name: "Palo Alto",      value: "Palo Alto"     },
          { name: "LanSchool",      value: "LanSchool"     },
          { name: "Qustodio",       value: "Qustodio"      },
          { name: "Sophos",         value: "Sophos"        },
          { name: "ContentKeeper",  value: "ContentKeeper" },
          { name: "Smoothwall",     value: "Smoothwall"    },
          { name: "GoGuardian AI",  value: "GoGuardian AI" },
          { name: "LanSchool Air",  value: "LanSchool Air" },
          { name: "Netsweeper",     value: "Netsweeper"    },
        )
    )
    .addStringOption((o) =>
      o.setName("type").setDescription("Link type to show").setRequired(false)
        .addChoices(
          { name: "Full (proxy + music + AI + remote)", value: "full" },
          { name: "Static (games + launcher only)", value: "static" },
          { name: "All", value: "all" },
        )
    ),

  new SlashCommandBuilder()
    .setName("findlink")
    .setDescription("Find a FreeDNS domain that is unblocked by a specific school content filter")
    .addStringOption((o) =>
      o.setName("filter").setDescription("Which filter to check against").setRequired(true)
        .addChoices(
          { name: "GoGuardian V2",  value: "goguardianv2"  },
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
      o.setName("domains").setDescription("Which domains to search (default: public only)").setRequired(false)
        .addChoices(
          { name: "Public only",         value: "public" },
          { name: "Public + Private",    value: "all"    },
        )
    )
    .addBooleanOption((o) =>
      o.setName("skip_uncategorized").setDescription("Skip domains with no known category (default: true)").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("setupfilterroles")
    .setDescription("Post the filter role picker panel in this channel (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("setupfilterchannels")
    .setDescription("Create filter-specific link channels under a Filter Links category (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("setuppings")
    .setDescription("Post the notification role picker panel in this channel (Staff only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Give or remove the Veil Admin role (Owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) =>
      o.setName("user").setDescription("The user to make/remove as admin").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("action").setDescription("Add or remove").setRequired(false)
        .addChoices(
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" },
        )
    ),

  new SlashCommandBuilder()
    .setName("setupadmin")
    .setDescription("Create the Veil Admin role if it doesn't exist (Owner only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((c) => c.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);

rest
  .put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands })
  .then(() => console.log("Slash commands registered!"))
  .catch(console.error);
