import { ConfirmationModal, PluginSettingTab } from 'obsidian';
import type { App, SettingDefinitionItem } from 'obsidian';
import type ManualOrderPlugin from './main';

export class ManualOrderSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ManualOrderPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Use manual order',
				desc: 'Show files and folders in the order you arranged them. When this is off, the file explorer uses its normal sort order and your arrangement is kept for later.',
				control: { type: 'toggle', key: 'enabled', defaultValue: true },
			},
			{
				name: 'Reset all folders',
				desc: 'Forget the arrangement of every folder and go back to the normal sort order.',
				render: (setting) => {
					setting.addButton((button) =>
						button
							.setButtonText('Reset')
							.setDestructive()
							.onClick(() => this.confirmResetAll()),
					);
				},
			},
		];
	}

	setControlValue(key: string, value: unknown): void {
		if (key === 'enabled' && typeof value === 'boolean') this.plugin.setEnabled(value);
	}

	private confirmResetAll(): void {
		new ConfirmationModal(this.app)
			.setTitle('Reset all folders?')
			.setContent('Every folder goes back to the normal sort order. This cannot be undone.')
			.addButton((button) =>
				button
					.setButtonText('Reset')
					.setDestructive()
					.onClick(() => this.plugin.resetAll()),
			)
			.addCancelButton()
			.open();
	}
}
