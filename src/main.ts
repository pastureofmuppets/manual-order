import { Notice, Plugin, TFolder, debounce } from 'obsidian';
import type { Menu, TAbstractFile } from 'obsidian';
import { DragToReorder, childPath, getExplorerViews, patchExplorerSort } from './explorer';
import type { ExplorerItem } from './explorer';
import {
	applyOrder,
	deleteFolderKeys,
	placeNames,
	removeChild,
	renameChild,
	renameFolderKeys,
	sanitizeOrder,
	shiftName,
} from './order';
import type { OrderMap, Position } from './order';
import { ManualOrderSettingTab } from './settings';

export interface ManualOrderSettings {
	enabled: boolean;
	order: OrderMap;
}

export default class ManualOrderPlugin extends Plugin {
	settings: ManualOrderSettings = { enabled: true, order: {} };

	private isPatched = false;
	private readonly requestSave = debounce(() => void this.saveData(this.settings), 500, true);
	private readonly dragToReorder = new DragToReorder(
		this,
		() => this.settings.enabled,
		(files, target, position) => this.placeFiles(files, target, position),
	);

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new ManualOrderSettingTab(this.app, this));

		this.addCommand({
			id: 'toggle',
			name: 'Toggle on or off',
			callback: () => {
				this.setEnabled(!this.settings.enabled);
				new Notice(this.settings.enabled ? 'Manual order is on.' : 'Manual order is off. Showing the normal sort order.');
			},
		});
		this.addCommand({
			id: 'move-file-up',
			name: 'Move current file up',
			checkCallback: (checking) => this.moveActiveFile(-1, checking),
		});
		this.addCommand({
			id: 'move-file-down',
			name: 'Move current file down',
			checkCallback: (checking) => this.moveActiveFile(1, checking),
		});

		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.onRename(file, oldPath)));
		this.registerEvent(this.app.vault.on('delete', (file) => this.onDelete(file)));
		this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => this.onFileMenu(menu, file)));

		this.app.workspace.onLayoutReady(() => {
			this.setUpExplorers();
			// Explorers can load later, for example when the sidebar tab is first opened.
			this.registerEvent(this.app.workspace.on('layout-change', () => this.setUpExplorers()));
		});
	}

	onunload(): void {
		this.dragToReorder.clear();
		this.requestSave.run();
	}

	async onExternalSettingsChange(): Promise<void> {
		this.requestSave.cancel();
		await this.loadSettings();
		this.refresh();
	}

	async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		const saved: Partial<Record<keyof ManualOrderSettings, unknown>> = data && typeof data === 'object' ? data : {};
		this.settings = {
			enabled: typeof saved.enabled === 'boolean' ? saved.enabled : true,
			order: sanitizeOrder(saved.order),
		};
	}

	setEnabled(enabled: boolean): void {
		this.settings.enabled = enabled;
		this.requestSave();
		this.refresh();
	}

	resetAll(): void {
		this.settings.order = {};
		this.requestSave();
		this.refresh();
	}

	private setUpExplorers(): void {
		const views = getExplorerViews(this.app);
		const first = views[0];
		if (!first) return;
		if (!this.isPatched) {
			const unpatch = patchExplorerSort(first, (folder, items) => this.sortItems(folder, items));
			this.isPatched = true;
			this.register(() => {
				unpatch();
				this.refresh();
			});
		}
		for (const view of views) {
			if (this.dragToReorder.attach(view)) view.requestSort();
		}
	}

	private sortItems(folder: TFolder, items: ExplorerItem[]): ExplorerItem[] {
		if (!this.settings.enabled) return items;
		return applyOrder(items, (item) => item.file.name, this.settings.order[folder.path]);
	}

	private refresh(): void {
		for (const view of getExplorerViews(this.app)) view.requestSort();
	}

	/** Names of a folder's children, in the order the file explorer shows them. */
	private getShownNames(folder: TFolder): string[] {
		const view = getExplorerViews(this.app)[0];
		const files = view && this.isPatched ? view.getSortedFolderItems(folder).map((item) => item.file) : folder.children;
		return files.map((file) => file.name);
	}

	private setOrder(folder: TFolder, names: string[]): void {
		this.settings.order[folder.path] = names;
		this.requestSave();
		this.refresh();
	}

	private async placeFiles(files: TAbstractFile[], target: TAbstractFile, position: Position): Promise<void> {
		const folder = target.parent;
		if (!folder) return;
		// Keep several dragged items in the order they're shown, not the order they were selected.
		const shownIndex = new Map<TAbstractFile, number>();
		const namesByFolder = new Map<TFolder, string[]>();
		for (const file of files) {
			const parent = file.parent;
			if (!parent) continue;
			let names = namesByFolder.get(parent);
			if (!names) {
				names = this.getShownNames(parent);
				namesByFolder.set(parent, names);
			}
			shownIndex.set(file, names.indexOf(file.name));
		}
		const ordered = files.slice().sort((a, b) => (shownIndex.get(a) ?? 0) - (shownIndex.get(b) ?? 0));

		for (const file of ordered) {
			if (file.parent === folder) continue;
			try {
				await this.app.fileManager.renameFile(file, childPath(folder, file.name));
			} catch (error) {
				console.error('Manual Order: could not move', file.path, error);
				new Notice(`Couldn't move "${file.name}" to "${folder.isRoot() ? '/' : folder.path}".`);
				return;
			}
		}
		const moving = ordered.map((file) => file.name);
		this.setOrder(folder, placeNames(this.getShownNames(folder), moving, target.name, position));
	}

	private moveActiveFile(step: -1 | 1, checking: boolean): boolean {
		const file = this.app.workspace.getActiveFile();
		const folder = file?.parent;
		if (!this.settings.enabled || !file || !folder) return false;
		if (checking) return true;
		const names = shiftName(this.getShownNames(folder), file.name, step);
		if (names) this.setOrder(folder, names);
		return true;
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		const { order } = this.settings;
		// When a folder moves, Obsidian renames the folder first and then each item inside it.
		// Re-keying here leaves nothing for those follow-up events to change.
		const keysChanged = file instanceof TFolder && renameFolderKeys(order, oldPath, file.path);
		const listChanged = renameChild(order, oldPath, file.path);
		if (keysChanged || listChanged) this.requestSave();
	}

	private onDelete(file: TAbstractFile): void {
		const { order } = this.settings;
		const keysChanged = file instanceof TFolder && deleteFolderKeys(order, file.path);
		const listChanged = removeChild(order, file.path);
		if (keysChanged || listChanged) this.requestSave();
	}

	private onFileMenu(menu: Menu, file: TAbstractFile): void {
		if (!(file instanceof TFolder) || !this.settings.order[file.path]) return;
		menu.addItem((item) =>
			item
				.setTitle('Reset manual order')
				.setIcon('rotate-ccw')
				.setSection('action')
				.onClick(() => {
					delete this.settings.order[file.path];
					this.requestSave();
					this.refresh();
				}),
		);
	}
}
