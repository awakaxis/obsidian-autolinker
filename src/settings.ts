import { App, PluginSettingTab, Setting } from "obsidian";
import AutoLinker from "./main";

export interface AutoLinkerSettings {
	indexFileName: string;
	enabled: boolean;
	hideIndex: boolean;
}

export const DEFAULT_SETTINGS: AutoLinkerSettings = {
	indexFileName: "autolinker-index",
	enabled: true,
	hideIndex: true,
};

export class ALSettingTab extends PluginSettingTab {
	plugin: AutoLinker;

	constructor(app: App, plugin: AutoLinker) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Index Directory")
			.setDesc("Directory that contains your index files.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.indexFileName)
					.onChange(async (value) => {
						this.plugin.settings.indexFileName = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Enable Plugin")
			.setDesc("Enable or disable Autolinker")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enabled)
					.onChange(async (value) => {
						this.plugin.settings.enabled = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Hide Indexes")
			.setDesc("Hide Index notes in explorer view")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideIndex)
					.onChange(async (value) => {
						this.plugin.settings.hideIndex = value;
						this.plugin.reloadObserver();
						await this.plugin.saveSettings();
					}),
			);
	}
}
