# Manual Order

Drag files and folders into any order you like in Obsidian's file explorer.

Manual Order is small and has no settings to learn. It doesn't rename your files or add anything to your notes. It only remembers the order you choose.

## How to use

- **Reorder:** drag a file or folder onto the top or bottom edge of another item. A line shows where it will go. Drop it there.
- **Move into a folder:** drop onto the middle of a folder, as you normally would.
- **Move and place in one step:** drop between two items in another folder. The item moves to that folder and lands at that spot.
- **Move several items:** select them first (Shift-click or Cmd/Ctrl-click), then drag. They keep the order they're shown in.
- **New files** appear after the items you've arranged, sorted by Obsidian's normal sort order.
- **Reset one folder:** right-click the folder and choose **Reset manual order**. This appears only on folders you've arranged.

### Commands

Search for these in the command palette. You can give them hotkeys in **Settings → Hotkeys**.

- **Move current file up** and **Move current file down** move the open note one step within its folder. Useful from the keyboard, or on a phone or tablet.
- **Toggle on or off** switches between your order and Obsidian's normal sort order.

### Settings

- **Use manual order:** turn it off to see Obsidian's normal sort order. Your arrangement is kept, so it comes back when you turn this on again.
- **Reset all folders:** forget the arrangement of every folder.

## Good to know

- Your order is saved in the plugin's own data file inside your vault's config folder. If you sync plugin settings, for example with Obsidian Sync, your order syncs too.
- Renaming, moving and deleting files and folders in Obsidian keeps your order up to date.
- Folders and files can be mixed in any order. Until you arrange a folder, it keeps Obsidian's usual "folders first" layout.
- Obsidian's sort menu in the file explorer still works. It decides where items you haven't arranged yet appear, such as new files.
- Use only one plugin that changes the file explorer's order at a time. Two such plugins can conflict.

## Compatibility

- Requires Obsidian 1.13.0 or later. Works on desktop and mobile.
- Obsidian has no official API for the file explorer's order. Manual Order hooks into the core file explorer's internal sort step, and it checks that this step exists first. If a future Obsidian update changes it, the plugin stops reordering, the file explorer goes back to its normal order, and your saved order is kept.

## Privacy

Manual Order makes no network requests, collects no data, and reads nothing outside your vault.

## Installation

**From Obsidian:** open **Settings → Community plugins → Browse**, search for "Manual Order", then select **Install** and **Enable**.

**Manually:** download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/pastureofmuppets/manual-order/releases/latest). Put them in `<your vault>/.obsidian/plugins/manual-order/`, reload Obsidian, and enable the plugin in **Settings → Community plugins**.

## Development

```bash
npm install
npm run dev     # rebuild on every change
npm run build   # type-check and build main.js
npm run lint    # Obsidian's official ESLint rules
```

## Credits

Uses [monkey-around](https://github.com/pjeby/monkey-around) by PJ Eby (ISC license), which adds the sort hook and removes it cleanly when the plugin is turned off.

## License

[MIT](LICENSE). Anyone can use, copy, change and share this plugin, including in commercial projects.
