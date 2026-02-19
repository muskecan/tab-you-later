# Tab You Later

Cross-browser "read later" extension repository for Firefox and Chrome.

Tab You Later helps users quickly save tabs and links, organize them with categories, and revisit them later from a fast popup UI.

## Screenshots

### Main Menu

![Main menu of Tab You Later extension](gui.png)

### Settings Page

![Settings page of Tab You Later extension](settings.png)

### Reminder Picker

![Reminder picker in Tab You Later popup](reminder.png)

## Repository Structure

```text
tab-you-later/
├── firefox/   # Firefox build (Manifest V2)
│   ├── manifest.json
│   ├── background.js
│   ├── popup/
│   ├── options/
│   ├── onboarding/
│   ├── i18n/
│   ├── icons/
│   └── README.md
└── chrome/    # Chrome build (Manifest V3)
    ├── manifest.json
    ├── background.js
    ├── popup/
    ├── options/
    ├── onboarding/
    ├── i18n/
    ├── icons/
    └── README.md
```

## Current Version

- Firefox: `1.0.0`
- Chrome: `1.0.0`

## Shared Feature Set

- Save page/link from context menu
- Save + close current tab
- Save all tabs in current window
- Real-time popup list with search
- Advanced search operators (`cat:`, `site:`, `before:`, `after:`, `is:pinned`)
- Categories, pinning, sorting, manual drag-and-drop
- Bulk actions (open/delete)
- 5-second undo delete
- Optional reminder notifications (per-item + daily summary)
- Optional local encryption (session passphrase)
- Favicon modes (off/live/cached)
- Import/export JSON backup
- Auto-delete on open and auto-expire
- Badge item count and duplicate detection
- Full i18n (EN, TR, DE, FR, ES, ZH, JA)

## Install (Development)

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `firefox/manifest.json`

### Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `chrome/` folder

## Browser Store URLs

- Firefox Add-ons listing: `https://addons.mozilla.org/firefox/addon/tab-you-later/`
- Chrome Web Store listing: `https://chromewebstore.google.com/detail/tab-you-later/REPLACE_WITH_EXTENSION_ID`

## Browser-Specific Notes

| Browser | Notes |
|---|---|
| Firefox | Uses Manifest V2 and `browser.*` APIs |
| Chrome | Uses Manifest V3 service worker and `chrome.storage.session` for session-state resilience |

## Privacy

No external backend is used. User data is stored in browser-managed storage APIs (`local`, optional `sync`, and `session` where applicable).

## Additional Docs

- Firefox details: `firefox/README.md`
- Chrome details: `chrome/README.md`

## License

Provided as-is for personal use.
