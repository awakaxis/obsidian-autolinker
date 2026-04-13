import { Notice, Plugin, TAbstractFile, TFile, TFolder, View } from "obsidian";
import {
	DEFAULT_SETTINGS,
	AutoLinkerSettings as AutoLinkerSettings,
	ALSettingTab,
} from "./settings";
import { format } from "util";
import matter from "gray-matter";

const HIDE_INDENT_CLASS = "hide-indentation-guide-autolinker";
const HIDE_FILE_CLASS = "hide-file-autolinker";

export default class AutoLinker extends Plugin {
	settings: AutoLinkerSettings;
	indexObserver: MutationObserver;

	removeLink(link: string, links: Set<string>): void {
		View;
		console.log(format("removeLink: %s, %s", link, links));
		if (!links.delete(link)) {
			console.log("removeLink: did not find literal link in set");
			const fileName: string = link.substring(
				link.lastIndexOf("/") + 1,
				link.lastIndexOf("."),
			);
			console.log("removeLink: removing " + fileName);
			links.delete(fileName);
			console.log("removeLink: " + links);
		}
	}

	isInIndexDirectory(path: string): boolean {
		return path.startsWith(this.settings.indexFileName);
	}

	reloadObserver() {
		if (this.settings.hideIndex) {
			this.indexObserver.observe(document.body, {
				childList: true,
				subtree: true,
			});
		} else {
			this.indexObserver.disconnect();
			document
				.querySelectorAll(".remove-indentation-guide, .hide-index")
				.forEach((element) => {
					element.classList.remove(
						"remove-indentation-guide",
						"hide-index",
					);
				});
		}
	}

	async alwaysUpdateLinks(): Promise<boolean> {
		const appConfigPath: string = this.app.vault.configDir + "/app.json";
		if (!(await this.app.vault.adapter.exists(appConfigPath))) {
			return false;
		}
		const content: string =
			await this.app.vault.adapter.read(appConfigPath);
		const data = JSON.parse(content);
		return data["alwaysUpdateLinks"];
	}

	async writeIndexFile(indexFile: TFile, links: Set<string>): Promise<void> {
		let data: string = format(
			"---\n%s\n---\n",
			matter(await this.app.vault.read(indexFile), {}).matter,
		);
		for (const link of links.values()) data += format("[[%s]]\n", link);
		await this.app.vault.modify(indexFile, data);
	}

	async parseIndexFile(indexFile: TFile): Promise<Set<string>> {
		const content: string = matter(
			await this.app.vault.read(indexFile),
			{},
		).content;
		const lines: string[] = content.split("\n");
		const links: Set<string> = new Set<string>();

		for (const line of lines) {
			let startIndx: number = -1;
			let endIndx: number = -1;
			for (let i = 0; i < line.length; i++) {
				if (
					startIndx === -1 &&
					i > 1 &&
					line[i - 1] === "[" &&
					line[i - 2] === "["
				) {
					startIndx = i;
				}
				if (
					i < line.length - 2 &&
					startIndx !== -1 &&
					line[i + 1] === "]" &&
					line[i + 2] === "]"
				) {
					endIndx = i;
					break;
				}
			}
			if (startIndx !== -1 && endIndx !== -1) {
				links.add(line.substring(startIndx, endIndx + 1));
			}
		}

		return links;
	}

	async tryGetIndexFile(
		searchPath: string,
		realFolderPath: string,
	): Promise<TFile | null> {
		const searchFolder: TFolder | null =
			this.app.vault.getFolderByPath(searchPath);
		if (!searchFolder) return null;

		for (const child of searchFolder.children) {
			if (child instanceof TFolder) {
				const indexFile = await this.tryGetIndexFile(
					child.path,
					realFolderPath,
				);
				if (indexFile) return indexFile;
				continue;
			}
			if (child instanceof TFile) {
				try {
					const content = await this.app.vault.cachedRead(child);
					const trackedFolder: string =
						matter(content).data["tracked-folder"];
					if (
						typeof trackedFolder === "string" &&
						trackedFolder === realFolderPath
					) {
						return child;
					}
				} catch (e) {
					console.log(
						format(
							"Rejected promise while parsing potential index file: %s (%s)",
							child.path,
							e,
						),
					);
				}
			}
		}

		return null;
	}

	async onload() {
		await this.loadSettings();

		this.indexObserver = new MutationObserver(() => {
			document
				.querySelectorAll(".nav-folder-children")
				.forEach((element) => {
					let count = 0;
					let seenIndex = false;
					for (let i = 0; i < element.children.length; i++) {
						const child = element.children.item(i);
						if (child?.classList.contains("nav-folder")) {
							count++;
						}
						if (child?.classList.contains("nav-file")) {
							count++;
							if (
								child.querySelector(
									'.nav-file-title[data-path$="index.md"]',
								)
							) {
								seenIndex = true;
								child.classList.add("hide-index");
							}
						}
					}
					element.classList.toggle(
						"remove-indentation-guide",
						count == 1 && seenIndex,
					);
				});
		});

		this.reloadObserver();

		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: "test",
			name: "Test",
			checkCallback: (checking: boolean) => {
				if (this.settings.enabled) {
					if (!checking) {
						new Notice(this.settings.indexFileName);
						this.app.workspace.containerEl
							.querySelectorAll(".nav-folder-children")
							.forEach((elem, key, parent) => {
								console.log(elem.classList);
							});
					}

					return true;
				}
				return false;
			},
		});

		this.addCommand({
			id: "read-config",
			name: "Read Config",
			checkCallback: (checking: boolean) => {
				if (!this.settings.enabled) return false;

				if (!checking) {
					(async () => {
						console.log(await this.alwaysUpdateLinks());
					})();
				}
				return true;
			},
		});

		this.addCommand({
			id: "parse-index-path",
			name: "Parse",
			checkCallback: (checking: boolean) => {
				if (!this.settings.enabled) return false;

				if (!checking) {
					(async () => {
						const indexFile: TFile | null =
							await this.tryGetIndexFile(
								this.settings.indexFileName,
								"Project 1/Cool Folder",
							);
						if (indexFile != null) {
							console.log(
								"located index file: " + indexFile.name,
							);
							const set = await this.parseIndexFile(indexFile);
							if (set) {
								console.log(set);
							}
						}
					})();
				}
				return true;
			},
		});

		this.addSettingTab(new ALSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.registerEvent(
				this.app.vault.on("create", (abstractFile: TAbstractFile) => {
					if (this.isInIndexDirectory(abstractFile.path)) {
						return;
					}
					if (abstractFile instanceof TFile) {
						const file: TFile = abstractFile;
						(async () => {
							if (file.parent) {
								const indexFile: TFile | null =
									await this.tryGetIndexFile(
										this.settings.indexFileName,
										file.parent.path,
									);
								if (indexFile) {
									const links: Set<string> =
										await this.parseIndexFile(indexFile);
									links.add(file.path);
									await this.writeIndexFile(indexFile, links);
								}
							}
						})();
					}
				}),
			);
		});

		this.registerEvent(
			this.app.vault.on(
				"rename",
				(abstractFile: TAbstractFile, oldPath: string) => {
					if (abstractFile instanceof TFile) {
						const oldFolder: string = oldPath.substring(
							0,
							oldPath.lastIndexOf("/"),
						);
						const newFolder: string | null = abstractFile.parent
							? abstractFile.parent.path
							: null;
						(async () => {
							if (
								oldFolder === newFolder &&
								(await this.alwaysUpdateLinks())
							) {
								return;
							}
							const oldIndex: TFile | null =
								!this.isInIndexDirectory(oldPath)
									? await this.tryGetIndexFile(
											this.settings.indexFileName,
											oldFolder,
										)
									: null;

							const newIndex: TFile | null =
								abstractFile.parent != null &&
								!this.isInIndexDirectory(abstractFile.path)
									? await this.tryGetIndexFile(
											this.settings.indexFileName,
											abstractFile.parent.path,
										)
									: null;

							if (oldIndex) {
								console.log("rename: removing old link");
								const oldLinks: Set<string> =
									await this.parseIndexFile(oldIndex);
								this.removeLink(oldPath, oldLinks);
								this.writeIndexFile(oldIndex, oldLinks);
							}

							if (newIndex) {
								console.log("rename: adding new link");
								const newLinks: Set<string> =
									await this.parseIndexFile(newIndex);
								newLinks.add(abstractFile.path);
								this.writeIndexFile(newIndex, newLinks);
							}
						})();
					}
				},
			),
		);

		this.registerEvent(
			this.app.vault.on("delete", (abstractFile: TAbstractFile) => {
				console.log(abstractFile.path);
				if (this.isInIndexDirectory(abstractFile.path)) {
					console.log("bad");
					return;
				}
				if (abstractFile instanceof TFile) {
					const file: TFile = abstractFile;
					(async () => {
						console.log("wowzerss");
						console.log(file.path);
						const folderPath: string = file.path.substring(
							0,
							file.path.lastIndexOf("/"),
						);
						console.log(folderPath);
						const indexFile: TFile | null =
							await this.tryGetIndexFile(
								this.settings.indexFileName,
								folderPath,
							);
						if (indexFile) {
							const links: Set<string> =
								await this.parseIndexFile(indexFile);
							this.removeLink(file.path, links);
							await this.writeIndexFile(indexFile, links);
						}
					})();
				}
			}),
		);
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<AutoLinkerSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
