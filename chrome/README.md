# Tab You Later — Chrome Edition

A focused Chrome extension that helps you tame tab overload. Save pages and links to a personal "read later" queue — searchable, sortable, and always one click away.

Built on Manifest V3 with a service worker background and `chrome.storage.session` for resilient session state.

## Current Version

`1.0.6`

## Install

> **Chrome Web Store:** [https://chromewebstore.google.com/detail/tab-you-later/hhggidekeifkiafeoclfjmhfdboehiib](https://chromewebstore.google.com/detail/tab-you-later/hhggidekeifkiafeoclfjmhfdboehiib)

## Store URLs

- **Firefox Add-ons:** [https://addons.mozilla.org/firefox/addon/tab-you-later/](https://addons.mozilla.org/firefox/addon/tab-you-later/)
- **Chrome Web Store:** [https://chromewebstore.google.com/detail/tab-you-later/hhggidekeifkiafeoclfjmhfdboehiib](https://chromewebstore.google.com/detail/tab-you-later/hhggidekeifkiafeoclfjmhfdboehiib)

### Development / Sideload

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `chrome/` folder from this repository

## Features

### Core

- **Context Menu Integration** — Right-click any page or link to save it, with optional category assignment
- **Save & Close** — Save the current tab and close it in a single action; when categories exist, a picker appears to choose the target category
- **Save All Tabs** — Save every open tab in the current window with one click
- **Popup UI** — Quick access from the toolbar with a real-time search bar and scrollable list
- **Real-Time Updates** — Popup list refreshes automatically when items are added or changed in the background
- **Badge Count** — Display the number of saved items on the toolbar icon (toggleable)

### Organization

- **Categories** — Create color-coded categories, assign them to links, and filter by category
- **Quick Category Creation** — Create a new category from the right-click menu or the popup without leaving the current page (standalone mini-window)
- **Save Page to New Category** — Option to save the current page into the category during creation
- **Category Editing** — Rename and recolor existing categories from Settings
- **Pin Important Items** — Pin links to keep them at the top regardless of sort order
- **Sort & Reorder** — Sort by newest, oldest, alphabetical, domain, or manual drag-and-drop
- **Bulk Actions** — Multi-select items to open or delete in batch

### Per-URL Notes

- **Inline Notes** — Attach a text note to any saved link via the note icon
- **Edit / Delete** — Notes open as an editable dropdown with save, cancel, and delete controls

### Search

- **Real-time Filter** — Instant search across titles and URLs
- **Advanced Operators** — `cat:Work`, `site:github.com`, `is:pinned`, `before:2025-01-01`, `after:2024-06-15`

### Reminders & Notifications

- **Per-Item Reminders** — Set a reminder on any saved link with a custom date and time picker
- **Daily Summary** — Receive a daily notification showing how many unread links are waiting
- **Browser Notification Permission** — Managed gracefully; grant or revoke from Settings at any time

### Privacy & Security

- **Optional Local Encryption** — AES-GCM encryption with PBKDF2 key derivation; passphrase persisted in session storage so it survives service worker restarts without re-prompting
- **Network-Minimized Favicon Mode** — Three modes: off, live (fetched on view), or cached (stored as data URL on save)
- **No External Servers** — All data stays in Chrome's local or sync storage APIs
- **Theme Modes (Auto / Light / Dark)** — Auto follows system/Chrome theme; users can force a persistent Light or Dark mode from onboarding or Settings

### Data Management

- **Google Sync** — Optionally sync saved links across all your devices via Google Account
- **Import / Export** — Backup and restore your entire list in JSON format
- **Auto-Delete** — Automatically remove a link from the list once you open it
- **Auto-Expire** — Remove items older than a configurable number of days (non-retroactive)
- **Undo Delete** — 5-second undo toast after deleting single or multiple items
- **Duplicate Detection** — Visual cue when trying to save a link that already exists
- **Onboarding** — Introductory page on first install, ending with theme selection (Auto / Light / Dark)

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
3. **Save & close** — Use the save-close icon in the popup header or the context menu; pick a category if prompted
4. **Create a category** — Right-click and choose *Create Category…*, or use the "+" option in the save-close picker
5. **View saved items** — Click the Tab You Later icon in the toolbar
6. **Search** — Type in the search box; combine operators like `cat:Work site:github.com is:pinned`
7. **Pin** — Hover over an item and click the pin icon to keep it at the top
8. **Add a note** — Click the note icon on an item to write or edit a note
9. **Set a reminder** — Click the bell icon on an item and pick a date/time
10. **Open** — Click any item to open it in a new tab
11. **Delete** — Hover and click the trash icon; an undo toast appears for 5 seconds
12. **Bulk actions** — Click the grid icon to enter select mode, then open or delete selected items
13. **Edit categories** — Open Settings to rename or recolor existing categories
14. **Encryption** — Enable in Settings with a passphrase; unlock once per browser session
15. **Settings** — Click the gear icon in the popup to configure all options, including theme mode

## Chrome-Specific Notes

| Topic | Detail |
|---|---|
| Manifest version | V3 (service worker) |
| Background model | Non-persistent service worker; transient state kept in `chrome.storage.session` |
| Encryption session | Passphrase stored in `chrome.storage.session` and key re-derived on worker wake — no re-prompt needed within the same browser session |
| Undo buffer | Persisted in `chrome.storage.session` with 5-second expiry timestamps |
| Notification click | Tries `chrome.action.openPopup()`; falls back to opening popup in a new tab |
| Minimum version | Chrome 102+ (required for `chrome.storage.session`) |

## File Structure

```
chrome/
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
├── quick-category/
│   ├── quick-category.html
│   ├── quick-category.css
│   └── quick-category.js
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
| `storage` | Save links to local, sync, and session storage |
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
  "reminderAt": null,
  "note": "User-written note or null"
}
```

## License

This project is provided as-is for personal use.
