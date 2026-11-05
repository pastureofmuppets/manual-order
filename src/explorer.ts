import { TAbstractFile, TFolder } from 'obsidian';
import type { App, Plugin, View } from 'obsidian';
import { around } from 'monkey-around';
import type { Position } from './order';

/*
 * Obsidian has no public API for the file explorer's sort order, so this
 * file uses a few private members of the core file explorer. Each one is
 * checked before use: if a future Obsidian version changes them, the plugin
 * does nothing and the explorer keeps its normal sort order.
 */

export interface ExplorerItem {
	file: TAbstractFile;
}

export interface FileExplorerView extends View {
	getSortedFolderItems(folder: TFolder): ExplorerItem[];
	requestSort(): void;
}

interface Draggable {
	type: string;
	file?: TAbstractFile | null;
	files?: TAbstractFile[];
}

declare module 'obsidian' {
	interface App {
		dragManager?: {
			draggable: Draggable | null;
		};
	}
}

const EXPLORER_VIEW_TYPE = 'file-explorer';
const TITLE_SELECTOR = '.nav-file-title, .nav-folder-title';
const CLASS_BEFORE = 'manual-order-drop-before';
const CLASS_AFTER = 'manual-order-drop-after';
/** Share of a folder row, at the top and bottom, that places instead of moving into the folder. */
const FOLDER_EDGE = 0.25;

function isFileExplorerView(view: View): view is FileExplorerView {
	return (
		view.getViewType() === EXPLORER_VIEW_TYPE &&
		'getSortedFolderItems' in view &&
		typeof view.getSortedFolderItems === 'function' &&
		'requestSort' in view &&
		typeof view.requestSort === 'function'
	);
}

/** Loaded file explorer views. Views that Obsidian hasn't loaded yet are skipped. */
export function getExplorerViews(app: App): FileExplorerView[] {
	return app.workspace
		.getLeavesOfType(EXPLORER_VIEW_TYPE)
		.map((leaf) => leaf.view)
		.filter(isFileExplorerView);
}

/** Wraps the explorer's sort so `sort` can reorder each folder. Returns a function that undoes it. */
export function patchExplorerSort(
	view: FileExplorerView,
	sort: (folder: TFolder, items: ExplorerItem[]) => ExplorerItem[],
): () => void {
	const prototype = Object.getPrototypeOf(view) as FileExplorerView;
	return around(prototype, {
		getSortedFolderItems(next) {
			return function (this: FileExplorerView, folder: TFolder): ExplorerItem[] {
				const items = next.call(this, folder);
				try {
					return sort(folder, items);
				} catch (error) {
					console.error('Manual Order: could not sort folder', folder.path, error);
					return items;
				}
			};
		},
	});
}

export function childPath(folder: TFolder, name: string): string {
	return folder.isRoot() ? name : `${folder.path}/${name}`;
}

interface DropTarget {
	el: HTMLElement;
	file: TAbstractFile;
	position: Position;
}

export type DropCallback = (files: TAbstractFile[], target: TAbstractFile, position: Position) => Promise<void>;

/**
 * Adds "drop between items" to the file explorer. Dropping on the top or
 * bottom edge of a row places the dragged items there. Dropping in the
 * middle of a folder row still moves items into that folder, as usual.
 */
export class DragToReorder {
	private readonly attached = new WeakSet<HTMLElement>();
	private indicatorEl: HTMLElement | null = null;

	constructor(
		private readonly plugin: Plugin,
		private readonly isEnabled: () => boolean,
		private readonly onDrop: DropCallback,
	) {}

	/** Listens to drag events in this view. Returns false if it already was. */
	attach(view: FileExplorerView): boolean {
		const el = view.containerEl;
		if (this.attached.has(el)) return false;
		this.attached.add(el);
		// Capture phase, so this runs before the explorer's own drop handling.
		this.plugin.registerDomEvent(el, 'dragenter', (evt) => this.handleDragOver(evt), true);
		this.plugin.registerDomEvent(el, 'dragover', (evt) => this.handleDragOver(evt), true);
		this.plugin.registerDomEvent(el, 'drop', (evt) => this.handleDrop(evt), true);
		this.plugin.registerDomEvent(el, 'dragend', () => this.showIndicator(null), true);
		this.plugin.registerDomEvent(el, 'dragleave', (evt) => {
			if (!el.contains(evt.relatedTarget as Node | null)) this.showIndicator(null);
		});
		return true;
	}

	/** Removes the drop line, if one is showing. */
	clear(): void {
		this.showIndicator(null);
	}

	private handleDragOver(evt: DragEvent): void {
		const target = this.findTarget(evt);
		this.showIndicator(target);
		if (!target) return;
		// Claiming the event makes the explorer skip its "move into folder" handling.
		evt.preventDefault();
		if (evt.dataTransfer) evt.dataTransfer.dropEffect = 'move';
	}

	private handleDrop(evt: DragEvent): void {
		const target = this.findTarget(evt);
		const files = this.getDraggedFiles();
		this.showIndicator(null);
		if (!target) return;
		evt.preventDefault();
		void this.onDrop(files, target.file, target.position);
	}

	private findTarget(evt: DragEvent): DropTarget | null {
		if (!this.isEnabled()) return null;
		const files = this.getDraggedFiles();
		if (files.length === 0) return null;

		const node = evt.targetNode;
		const start = node?.instanceOf(Element) ? node : (node?.parentElement ?? null);
		const el = start?.closest<HTMLElement>(TITLE_SELECTOR);
		const path = el?.getAttribute('data-path');
		if (!el || !path) return null;

		const { vault } = this.plugin.app;
		const file = vault.getAbstractFileByPath(path);
		const parent = file?.parent;
		if (!file || !parent || files.includes(file)) return null;

		for (const dragged of files) {
			if (dragged.parent === parent) continue;
			// A folder can't go inside itself.
			if (dragged instanceof TFolder && (parent === dragged || parent.path.startsWith(dragged.path + '/'))) {
				return null;
			}
			// Same name already in the target folder: leave it to Obsidian.
			if (vault.getAbstractFileByPath(childPath(parent, dragged.name))) return null;
		}

		const position = this.getPosition(el, file, evt.clientY);
		return position ? { el, file, position } : null;
	}

	private getPosition(el: HTMLElement, file: TAbstractFile, clientY: number): Position | null {
		const rect = el.getBoundingClientRect();
		if (rect.height === 0) return null;
		const ratio = (clientY - rect.top) / rect.height;
		if (!(file instanceof TFolder)) return ratio < 0.5 ? 'before' : 'after';
		if (ratio < FOLDER_EDGE) return 'before';
		// Below an open folder come its children, so only a closed folder gets an "after" edge.
		const isCollapsed = el.parentElement?.hasClass('is-collapsed') ?? true;
		if (ratio > 1 - FOLDER_EDGE && isCollapsed) return 'after';
		return null;
	}

	private getDraggedFiles(): TAbstractFile[] {
		const draggable = this.plugin.app.dragManager?.draggable;
		if (!draggable) return [];
		let candidates: unknown[] = [];
		if ((draggable.type === 'file' || draggable.type === 'folder') && draggable.file) {
			candidates = [draggable.file];
		} else if (draggable.type === 'files' && Array.isArray(draggable.files)) {
			candidates = draggable.files;
		}
		return candidates.filter((file): file is TAbstractFile => file instanceof TAbstractFile && file.parent !== null);
	}

	private showIndicator(target: DropTarget | null): void {
		const el = target?.el ?? null;
		if (this.indicatorEl && this.indicatorEl !== el) this.indicatorEl.removeClasses([CLASS_BEFORE, CLASS_AFTER]);
		this.indicatorEl = el;
		if (!target) return;
		target.el.toggleClass(CLASS_BEFORE, target.position === 'before');
		target.el.toggleClass(CLASS_AFTER, target.position === 'after');
	}
}
