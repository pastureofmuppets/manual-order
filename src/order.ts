/**
 * Pure helpers for the saved order. The order is stored per folder path
 * ("/" for the vault root) as a list of child names.
 */

export type OrderMap = Record<string, string[]>;

export type Position = 'before' | 'after';

export function parentPath(path: string): string {
	const index = path.lastIndexOf('/');
	return index === -1 ? '/' : path.slice(0, index);
}

export function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Sorts `items` by their position in `saved`. Items missing from `saved`
 * (for example new notes) keep their incoming order and go after the rest.
 */
export function applyOrder<T>(items: T[], nameOf: (item: T) => string, saved: string[] | undefined): T[] {
	if (!saved || saved.length === 0) return items;
	const rank = new Map<string, number>();
	saved.forEach((name, index) => rank.set(name, index));
	return items
		.map((item, index) => ({ item, key: rank.get(nameOf(item)) ?? saved.length + index }))
		.sort((a, b) => a.key - b.key)
		.map((entry) => entry.item);
}

/** Returns `names` with `moving` taken out and put back next to `target`. */
export function placeNames(names: string[], moving: string[], target: string, position: Position): string[] {
	const movingSet = new Set(moving);
	const result = names.filter((name) => !movingSet.has(name));
	let index = result.indexOf(target);
	if (index === -1) index = result.length;
	else if (position === 'after') index += 1;
	result.splice(index, 0, ...moving);
	return result;
}

/** Moves `name` one step up (-1) or down (+1). Returns null when it can't move. */
export function shiftName(names: string[], name: string, step: -1 | 1): string[] | null {
	const from = names.indexOf(name);
	const to = from + step;
	if (from === -1 || to < 0 || to >= names.length) return null;
	const result = names.slice();
	result.splice(from, 1);
	result.splice(to, 0, name);
	return result;
}

function isSameOrInside(key: string, folderPath: string): boolean {
	return key === folderPath || key.startsWith(folderPath + '/');
}

/** Re-keys the entries of a renamed or moved folder and its subfolders. */
export function renameFolderKeys(order: OrderMap, oldPath: string, newPath: string): boolean {
	let changed = false;
	for (const key of Object.keys(order)) {
		if (!isSameOrInside(key, oldPath)) continue;
		const names = order[key];
		delete order[key];
		if (names) order[newPath + key.slice(oldPath.length)] = names;
		changed = true;
	}
	return changed;
}

/** Drops the entries of a deleted folder and its subfolders. */
export function deleteFolderKeys(order: OrderMap, folderPath: string): boolean {
	let changed = false;
	for (const key of Object.keys(order)) {
		if (!isSameOrInside(key, folderPath)) continue;
		delete order[key];
		changed = true;
	}
	return changed;
}

/**
 * Updates the parent folder's list after a rename or move.
 * A rename keeps the item's spot. A move to another folder removes it from
 * the old list; it then shows after the arranged items in its new folder.
 */
export function renameChild(order: OrderMap, oldPath: string, newPath: string): boolean {
	const oldParent = parentPath(oldPath);
	const names = order[oldParent];
	if (!names) return false;
	const index = names.indexOf(baseName(oldPath));
	if (index === -1) return false;
	if (parentPath(newPath) === oldParent) names[index] = baseName(newPath);
	else names.splice(index, 1);
	if (names.length === 0) delete order[oldParent];
	return true;
}

/** Removes a deleted item from its parent folder's list. */
export function removeChild(order: OrderMap, path: string): boolean {
	const parent = parentPath(path);
	const names = order[parent];
	if (!names) return false;
	const index = names.indexOf(baseName(path));
	if (index === -1) return false;
	names.splice(index, 1);
	if (names.length === 0) delete order[parent];
	return true;
}

/** Reads a saved order defensively, so a damaged data file can't break loading. */
export function sanitizeOrder(value: unknown): OrderMap {
	const order: OrderMap = {};
	if (!value || typeof value !== 'object') return order;
	for (const [key, names] of Object.entries(value)) {
		if (!Array.isArray(names)) continue;
		const clean = names.filter((name): name is string => typeof name === 'string');
		if (clean.length > 0) order[key] = clean;
	}
	return order;
}
