export const DEMO_DEFAULT_CATEGORIES = [
  {
    "id": 1,
    "name": "Miscellaneous",
    "priority": 0,
    "color": "#9c9c9c"
  },
  {
    "id": 2,
    "name": "Hidden",
    "priority": 100,
    "color": "#475569"
  },
  {
    "id": 3,
    "name": "Browsing",
    "priority": 200,
    "color": "#ff7300"
  },
  {
    "id": 4,
    "name": "Music",
    "priority": 250,
    "color": "#ec4899"
  },
  {
    "id": 5,
    "name": "Reading",
    "priority": 300,
    "color": "#a855f7"
  },
  {
    "id": 6,
    "name": "Coding",
    "priority": 400,
    "color": "#1100ff"
  },
  {
    "id": 7,
    "name": "Gaming",
    "priority": 500,
    "color": "#2eff89"
  },
  {
    "id": 8,
    "name": "Watching",
    "priority": 600,
    "color": "#fff700"
  },
  {
    "id": 9,
    "name": "Social",
    "priority": 700,
    "color": "#5662f6"
  }
] as const;

export const DEMO_DEFAULT_SKIPPED_REGEXES = [
  "^$",
  "^Windows Default Lock Screen$",
  "^Task View$",
  "^Search$",
  "^Task Switching$",
  "^System tray overflow window\\.$",
  "^Program Manager$"
] as const;

export const DEMO_DEFAULT_CAT_REGEX = [
  {
    "id": 1,
    "cat_id": 9,
    "regex": "AnyDesk"
  },
  {
    "id": 2,
    "cat_id": 9,
    "regex": "Discord"
  },
  {
    "id": 3,
    "cat_id": 9,
    "regex": "WhatsApp"
  },
  {
    "id": 4,
    "cat_id": 9,
    "regex": "Telegram"
  },
  {
    "id": 5,
    "cat_id": 9,
    "regex": "Slack"
  },
  {
    "id": 6,
    "cat_id": 9,
    "regex": "Microsoft Teams"
  },
  {
    "id": 7,
    "cat_id": 9,
    "regex": "Zoom"
  },
  {
    "id": 8,
    "cat_id": 9,
    "regex": "Skype"
  },
  {
    "id": 9,
    "cat_id": 9,
    "regex": "Messenger"
  },
  {
    "id": 10,
    "cat_id": 8,
    "regex": "(?i)\\bS(?:0[1-9]|[1-9]\\d?)\\b|Season\\s+(?:0[1-9]|[1-9]\\d?)\\b"
  },
  {
    "id": 11,
    "cat_id": 8,
    "regex": "SteelSeries GG"
  },
  {
    "id": 12,
    "cat_id": 8,
    "regex": "Twitch"
  },
  {
    "id": 13,
    "cat_id": 8,
    "regex": "VoidFlix"
  },
  {
    "id": 14,
    "cat_id": 8,
    "regex": "Watch"
  },
  {
    "id": 15,
    "cat_id": 8,
    "regex": "YouTube"
  },
  {
    "id": 16,
    "cat_id": 8,
    "regex": "Netflix"
  },
  {
    "id": 17,
    "cat_id": 8,
    "regex": "Prime Video"
  },
  {
    "id": 18,
    "cat_id": 8,
    "regex": "Disney+"
  },
  {
    "id": 19,
    "cat_id": 8,
    "regex": "Hulu"
  },
  {
    "id": 20,
    "cat_id": 8,
    "regex": "HBO Max"
  },
  {
    "id": 21,
    "cat_id": 8,
    "regex": "VLC"
  },
  {
    "id": 22,
    "cat_id": 7,
    "regex": "Among Us"
  },
  {
    "id": 23,
    "cat_id": 7,
    "regex": "Deadlock"
  },
  {
    "id": 24,
    "cat_id": 7,
    "regex": "Fortnite"
  },
  {
    "id": 25,
    "cat_id": 7,
    "regex": "FragPunk"
  },
  {
    "id": 26,
    "cat_id": 7,
    "regex": "Freeways"
  },
  {
    "id": 27,
    "cat_id": 7,
    "regex": "Highguard"
  },
  {
    "id": 28,
    "cat_id": 7,
    "regex": "Marvel's Spider-Man 2 v1.526.0.0"
  },
  {
    "id": 29,
    "cat_id": 7,
    "regex": "Midnight Murder Club"
  },
  {
    "id": 30,
    "cat_id": 7,
    "regex": "Minecraft"
  },
  {
    "id": 31,
    "cat_id": 7,
    "regex": "Overwatch"
  },
  {
    "id": 32,
    "cat_id": 7,
    "regex": "Prison Life"
  },
  {
    "id": 33,
    "cat_id": 7,
    "regex": "Pummel Party"
  },
  {
    "id": 34,
    "cat_id": 7,
    "regex": "Roblox"
  },
  {
    "id": 35,
    "cat_id": 7,
    "regex": "Split Fiction"
  },
  {
    "id": 36,
    "cat_id": 7,
    "regex": "THE FINALS"
  },
  {
    "id": 37,
    "cat_id": 7,
    "regex": "Team Fortress 2 - Direct3D 9 - 64 Bit"
  },
  {
    "id": 38,
    "cat_id": 7,
    "regex": "Trackmania"
  },
  {
    "id": 39,
    "cat_id": 7,
    "regex": "VALORANT"
  },
  {
    "id": 40,
    "cat_id": 7,
    "regex": "^Rocket League \\(64-bit, DX11, Cooked\\)$"
  },
  {
    "id": 41,
    "cat_id": 7,
    "regex": "Steam"
  },
  {
    "id": 42,
    "cat_id": 7,
    "regex": "Epic Games"
  },
  {
    "id": 43,
    "cat_id": 7,
    "regex": "Battle.net"
  },
  {
    "id": 44,
    "cat_id": 7,
    "regex": "Riot Client"
  },
  {
    "id": 45,
    "cat_id": 7,
    "regex": "GOG Galaxy"
  },
  {
    "id": 46,
    "cat_id": 7,
    "regex": "EA app"
  },
  {
    "id": 47,
    "cat_id": 7,
    "regex": "Ubisoft Connect"
  },
  {
    "id": 48,
    "cat_id": 7,
    "regex": "Hi-Fi RUSH"
  },
  {
    "id": 49,
    "cat_id": 7,
    "regex": "Minecraft 1.21.11 - Multiplayer (3rd-party Server)"
  },
  {
    "id": 50,
    "cat_id": 7,
    "regex": "^Battle\\.net$"
  },
  {
    "id": 51,
    "cat_id": 7,
    "regex": "^Call of Duty®$"
  },
  {
    "id": 52,
    "cat_id": 7,
    "regex": "^New Instance - MultiMC 5$"
  },
  {
    "id": 53,
    "cat_id": 7,
    "regex": "^Ninjabrain Bot$"
  },
  {
    "id": 54,
    "cat_id": 7,
    "regex": "^THEFINALS$"
  },
  {
    "id": 55,
    "cat_id": 7,
    "regex": "^Xbox$"
  },
  {
    "id": 56,
    "cat_id": 6,
    "regex": "Administrator: Windows PowerShell"
  },
  {
    "id": 57,
    "cat_id": 6,
    "regex": "Cursor"
  },
  {
    "id": 58,
    "cat_id": 6,
    "regex": "GitHub Desktop"
  },
  {
    "id": 59,
    "cat_id": 6,
    "regex": "Visual Studio Code"
  },
  {
    "id": 60,
    "cat_id": 6,
    "regex": "cmd.exe"
  },
  {
    "id": 61,
    "cat_id": 6,
    "regex": "Terminal"
  },
  {
    "id": 62,
    "cat_id": 6,
    "regex": "Windows PowerShell"
  },
  {
    "id": 63,
    "cat_id": 6,
    "regex": "IntelliJ"
  },
  {
    "id": 64,
    "cat_id": 6,
    "regex": "PyCharm"
  },
  {
    "id": 65,
    "cat_id": 6,
    "regex": "WebStorm"
  },
  {
    "id": 66,
    "cat_id": 6,
    "regex": "Rider"
  },
  {
    "id": 67,
    "cat_id": 6,
    "regex": "PhpStorm"
  },
  {
    "id": 68,
    "cat_id": 6,
    "regex": "GoLand"
  },
  {
    "id": 69,
    "cat_id": 6,
    "regex": "CLion"
  },
  {
    "id": 70,
    "cat_id": 6,
    "regex": "Neovim"
  },
  {
    "id": 71,
    "cat_id": 6,
    "regex": "Sublime Text"
  },
  {
    "id": 72,
    "cat_id": 6,
    "regex": "Postman"
  },
  {
    "id": 73,
    "cat_id": 6,
    "regex": "DBeaver"
  },
  {
    "id": 74,
    "cat_id": 6,
    "regex": "Android Studio"
  },
  {
    "id": 75,
    "cat_id": 6,
    "regex": "Xcode"
  },
  {
    "id": 76,
    "cat_id": 5,
    "regex": "Coursera"
  },
  {
    "id": 77,
    "cat_id": 5,
    "regex": "Udemy"
  },
  {
    "id": 78,
    "cat_id": 5,
    "regex": "Duolingo"
  },
  {
    "id": 79,
    "cat_id": 5,
    "regex": "Khan Academy"
  },
  {
    "id": 80,
    "cat_id": 5,
    "regex": "edX"
  },
  {
    "id": 81,
    "cat_id": 5,
    "regex": "Skillshare"
  },
  {
    "id": 82,
    "cat_id": 5,
    "regex": "Pluralsight"
  },
  {
    "id": 83,
    "cat_id": 5,
    "regex": "Udacity"
  },
  {
    "id": 84,
    "cat_id": 5,
    "regex": "freeCodeCamp"
  },
  {
    "id": 85,
    "cat_id": 5,
    "regex": "LeetCode"
  },
  {
    "id": 86,
    "cat_id": 5,
    "regex": "GeeksforGeeks"
  },
  {
    "id": 87,
    "cat_id": 5,
    "regex": "Kindle"
  },
  {
    "id": 88,
    "cat_id": 5,
    "regex": "Adobe Acrobat"
  },
  {
    "id": 89,
    "cat_id": 5,
    "regex": " - PDF"
  },
  {
    "id": 90,
    "cat_id": 5,
    "regex": "\\.pdf"
  },
  {
    "id": 91,
    "cat_id": 5,
    "regex": "Google Docs"
  },
  {
    "id": 92,
    "cat_id": 5,
    "regex": "Notion"
  },
  {
    "id": 93,
    "cat_id": 5,
    "regex": "Medium"
  },
  {
    "id": 94,
    "cat_id": 5,
    "regex": "Substack"
  },
  {
    "id": 95,
    "cat_id": 5,
    "regex": "Wikipedia"
  },
  {
    "id": 96,
    "cat_id": 5,
    "regex": "Microsoft Word"
  },
  {
    "id": 97,
    "cat_id": 4,
    "regex": "Spotify"
  },
  {
    "id": 98,
    "cat_id": 4,
    "regex": "YouTube Music"
  },
  {
    "id": 99,
    "cat_id": 4,
    "regex": "iTunes"
  },
  {
    "id": 100,
    "cat_id": 4,
    "regex": "Apple Music"
  },
  {
    "id": 101,
    "cat_id": 4,
    "regex": "SoundCloud"
  },
  {
    "id": 102,
    "cat_id": 4,
    "regex": "Tidal"
  },
  {
    "id": 103,
    "cat_id": 4,
    "regex": "Deezer"
  },
  {
    "id": 104,
    "cat_id": 4,
    "regex": "Amazon Music"
  },
  {
    "id": 105,
    "cat_id": 4,
    "regex": "Pandora"
  },
  {
    "id": 106,
    "cat_id": 4,
    "regex": "Bandcamp"
  },
  {
    "id": 107,
    "cat_id": 4,
    "regex": "VLC"
  },
  {
    "id": 108,
    "cat_id": 4,
    "regex": "Winamp"
  },
  {
    "id": 109,
    "cat_id": 3,
    "regex": "Vivaldi"
  },
  {
    "id": 110,
    "cat_id": 3,
    "regex": "Chrome"
  },
  {
    "id": 111,
    "cat_id": 3,
    "regex": "Firefox"
  },
  {
    "id": 112,
    "cat_id": 3,
    "regex": "Microsoft Edge"
  },
  {
    "id": 113,
    "cat_id": 3,
    "regex": "Brave"
  },
  {
    "id": 114,
    "cat_id": 3,
    "regex": "Safari"
  },
  {
    "id": 115,
    "cat_id": 3,
    "regex": "Opera"
  },
  {
    "id": 116,
    "cat_id": 3,
    "regex": "Arc"
  },
  {
    "id": 117,
    "cat_id": 3,
    "regex": "DuckDuckGo"
  },
  {
    "id": 118,
    "cat_id": 3,
    "regex": "Floorp"
  },
  {
    "id": 119,
    "cat_id": 3,
    "regex": "Waterfox"
  }
] as const;
