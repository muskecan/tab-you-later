# Tab You Later

A focused Firefox extension that helps you tame tab overload. Save pages and links to a personal "read later" queue — searchable, sortable, and always one click away.

## Install

> **Firefox Add-ons:** [https://addons.mozilla.org/firefox/addon/tab-you-later/](https://addons.mozilla.org/firefox/addon/tab-you-later/)

## Store URLs

- Firefox Add-ons listing: `https://addons.mozilla.org/firefox/addon/tab-you-later/`
- Chrome Web Store listing: `https://chromewebstore.google.com/detail/tab-you-later/hhggidekeifkiafeoclfjmhfdboehiib`

### Development / Sideload

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` from this directory

## Features

### Core

- **Context Menu Integration** — Right-click any page or link to save it, with optional category assignment
- **Save & Close** — Save the current tab and close it in a single action
- **Save All Tabs** — Save every open tab in the current window with one click
- **Popup UI** — Quick access from the toolbar with a real-time search bar and scrollable list
- **Badge Count** — Display the number of saved items on the toolbar icon (toggleable)

### Organization

- **Categories** — Create color-coded categories, assign them to links, and filter by category
- **Pin Important Items** — Pin links to keep them at the top regardless of sort order
- **Sort & Reorder** — Sort by newest, oldest, alphabetical, domain, or manual drag-and-drop
- **Bulk Actions** — Multi-select items to open or delete in batch

### Search

- **Real-time Filter** — Instant search across titles and URLs
- **Advanced Operators** — `cat:Work`, `site:github.com`, `is:pinned`, `before:2025-01-01`, `after:2024-06-15`

### Reminders & Notifications

- **Per-Item Reminders** — Set a reminder on any saved link with a custom date and time picker
- **Daily Summary** — Receive a daily notification showing how many unread links are waiting
- **Browser Notification Permission** — Managed gracefully; grant or revoke from Settings at any time

### Privacy & Security

- **Optional Local Encryption** — AES-GCM encryption with PBKDF2 key derivation; passphrase kept in memory per session only
- **Network-Minimized Favicon Mode** — Three modes: off, live (fetched on view), or cached (stored as data URL on save)
- **No External Servers** — All data stays in Firefox's local or sync storage APIs
- **Dark / Light Mode** — Seamlessly adapts to your system or Firefox theme

### Data Management

- **Firefox Sync** — Optionally sync saved links across all your devices via Firefox Account
- **Import / Export** — Backup and restore your entire list in JSON format
- **Auto-Delete** — Automatically remove a link from the list once you open it
- **Auto-Expire** — Remove items older than a configurable number of days (non-retroactive)
- **Undo Delete** — 5-second undo toast after deleting single or multiple items
- **Duplicate Detection** — Visual cue when trying to save a link that already exists

### Internationalization

- **7 Languages** — Full UI translation across all screens and notifications

| Code | Language |
|------|----------|
| `en` | English (default) |
| `tr` | Türkçe |
| `de` | Deutsch |
| `fr` | Français |
| `es` | Español |
| `zh` | 中文 (Simplified) |
| `ja` | 日本語 |

Language is auto-detected from the browser and can be changed manually in Settings.

## Usage

1. **Save a page** — Right-click on any page and select *Send to Tab You Later*
2. **Save a link** — Right-click on any hyperlink and select *Send Link to Tab You Later*
3. **Save & close** — Use the save-close icon in the popup header or the context menu
4. **View saved items** — Click the Tab You Later icon in the toolbar
5. **Search** — Type in the search box; combine operators like `cat:Work site:github.com is:pinned`
6. **Pin** — Hover over an item and click the pin icon to keep it at the top
7. **Set a reminder** — Click the bell icon on an item and pick a date/time
8. **Open** — Click any item to open it in a new tab
9. **Delete** — Hover and click the trash icon; an undo toast appears for 5 seconds
10. **Bulk actions** — Click the grid icon to enter select mode, then open or delete selected items
11. **Categories** — Create categories in Settings, then assign via the folder icon on each item
12. **Encryption** — Enable in Settings with a passphrase; unlock once per browser session
13. **Settings** — Click the gear icon in the popup to configure all options

## File Structure

```
tab-you-later/
├── manifest.json
├── background.js
├── i18n/
│   ├── translations.js
│   └── i18n.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── onboarding/
│   ├── onboarding.html
│   ├── onboarding.css
│   └── onboarding.js
└── icons/
    ├── icon.svg
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    ├── icon-96.png
    └── icon-128.png
```

## Permissions

| Permission | Reason |
|---|---|
| `contextMenus` | Right-click menu integration |
| `storage` | Save links to local or sync storage |
| `tabs` | Open links in new tabs, read active tab info |
| `activeTab` | Access current page title and URL |
| `alarms` | Auto-expire checks and scheduled reminders |
| `notifications` *(optional)* | Daily summary and per-item reminder notifications |

## Data Schema

Each saved item is stored as:

```json
{
  "id": "uuid-v4",
  "title": "Page Title",
  "url": "https://example.com",
  "createdAt": 1700000000000,
  "category": "category-uuid or null",
  "favIconUrl": "data:image/... or https://...",
  "favIconDataUrl": "data:image/... (cached mode)",
  "pinned": false,
  "reminderAt": null
}
```

## License

This project is provided as-is for personal use.
