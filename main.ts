import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

function extractSections(noteContent: string) {
    // Regular expression with three capturing groups
    const regex = /(^[\s\S]*?)```statblock\n([\s\S]*?)\n```([\s\S]*)$/;
    const match = noteContent.match(regex);

    if (match && match.length > 3) {
        // Capturing the three parts of the text
        const beforeStatblock = match[1]; // Text before the statblock
        const statblockText = match[2];   // The statblock content
        const afterStatblock = match[3];  // Text after the statblock

        return { beforeStatblock, statblockText, afterStatblock };
    } else {
        // Handle the case where the structure is not found
        return null;
    }
}

export default class PF2eCreatureAdjuster extends Plugin {

	async onload() {

		this.addCommand({
			id: 'elite-upgrade',
			name: 'Elite Monster Upgrade',

			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						const text = markdownView.editor.getValue();
						this.createMonster(text, true);
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
			
		});

		this.addCommand({
			id: 'weak-downgrade',
			name: 'Weak Monster Downgrade',

			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						const text = markdownView.editor.getValue();
						this.createMonster(text, false);
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			}
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async createMonster(noteContent: string, elite=false) {
		// Find the stat block
		const sections = await extractSections(noteContent);

		if (sections) {
			// Retrieve the creature name
			let match = sections.statblockText.match(/name:\s*"\s*([^"]+)/);
			let name = "UNKNOWN";
			if (match) {
				name = match[1];
			} else {
				console.log("Failed to find the creature name!");
			}

			if (name.startsWith("Weak ") || name.startsWith("Elite ")) {
				new Notice ("Can't alter an already weak or elite creature.", 5000);
				return;
			}

			// Escape potential regex special characters in `name`
			const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

			// Include negative lookbehind to check for absence of `[` before the name
			const name_regex = new RegExp('(?<!\\[)' + escapedName, 'g');

			let name_prepend = 'Weak $&';
			let name_suffix = ", Weak";
			if (elite) {
				name_suffix = ", Elite"; 
				name_prepend = 'Elite $&';
			}

			// Change Name to Elite or Weak ...
			//    1. Change in frontmatter
			sections.beforeStatblock = sections.beforeStatblock.replace(name_regex, name_prepend);

			//    2. Change in statblock
			sections.statblockText = sections.statblockText.replace(name_regex, name_prepend);

			//    3. Change in after text
			sections.afterStatblock = sections.afterStatblock.replace(name_regex, name_prepend);

			// Retrieve level from statblock
			const statblock_level_regex = /(level:\s+"\w+?\s+)(-)?(\d+)/;
			match = sections.statblockText.match(statblock_level_regex);
			let level = -100;
			if (match) {
				level = parseInt(match[3], 10);
				// Handle negative level
				if (match[2]) {
					level = -level;
				}
			} else {
				console.log("Failed to locate level in statblock!");
			}
			const orig_level = level;

			// Retrieve current HP from statblock
			const hp_regex = /(hp:\s+)(\d+)/;
			match = sections.statblockText.match(hp_regex);
			let hp = -100;
			if (match) {
				hp = parseInt(match[2], 10);
			} else {
				console.log("Failed to locate hp in statblock!");
			}

			// Adjust HP
			if (elite) {
				if (level <= 1) {
					hp = hp + 10;
				} else if (level <= 4) {
					hp = hp + 15;
				} else if (level <= 19) {
					hp = hp + 20;
				} else {
					hp = hp + 30;
				}
			} else {
				if (level >= 1 && level <= 2) {
					hp = hp - 10;
				} else if (level <= 5) {
					hp = hp - 15;
				} else if (level <= 20) {
					hp = hp - 20;
				} else {
					hp = hp - 30;
				}
			}
			// Replace HP in statblock with new value
			sections.statblockText = sections.statblockText.replace(hp_regex, (match, p1) => `${p1}${hp}`);
			const hp_desc_regex = /(name:\s+HP\n\s+desc:\s+")(\d+)/;
			sections.statblockText = sections.statblockText.replace(hp_desc_regex, (match, p1) => `${p1}${hp}`);

			// Calculate new level
			if (elite) {
				if (level < 1) {
					level = level + 2;
				} else {
					level = level + 1;
				}
			} else {
				// Weak
				if (level == 1) {
					level = level - 2;
				} else {
					level = level - 1;
				}
			}

			// Change "level: " in frontmatter
			const level_regex = new RegExp('(level:\\s+)' + orig_level);
			sections.beforeStatblock = sections.beforeStatblock.replace(level_regex, (match, p1) => `${p1}${level}`);

			// Change "pf2e/create/level/" in frontmatter tags
			const level_tag_regex = new RegExp('(pf2e\/creature\/level\/)' + orig_level);
			sections.beforeStatblock = sections.beforeStatblock.replace(level_tag_regex, (match, p1) => `${p1}${level}`);

			// Change "level: " in statblock
			sections.statblockText = sections.statblockText.replace(statblock_level_regex, (match, p1) => `${p1}${level}`);			
			
			// Set general modifier
			let mod = -2;
			if (elite) {
				mod = +2;
			} 

			// Adjust AC
			const ac_regex = /(\nac:\s+)(\d+)/;
			match = sections.statblockText.match(ac_regex);
			let ac = 0;
			if (match) {
				ac = parseInt(match[2], 10);
				ac = ac + mod;
			}			
			sections.statblockText = sections.statblockText.replace(ac_regex, (match, p1) => `${p1}${ac}`);			

			// Adjust AC description - TODO: handle parenthetical expressions afterwards, such as "(X with shield raised)".  NOTE: Foundry doesn't handle this.
			const ac_desc_regex = /(name:\s+AC\n\s+desc:\s+")(\d+)/;
			sections.statblockText = sections.statblockText.replace(ac_desc_regex, (match, p1) => `${p1}${ac}`);			
			
			// Adjust DCs
			const dc_regex = /DC (\d+)/g;
			sections.statblockText = sections.statblockText.replace(dc_regex, (match, p1) => {
				return `DC ${parseInt(p1, 10) + mod}`;
			});

			// Adjust Saves
			const saves_regex = /(name:\s+AC\n\s+desc:\s+"\d+[\s\S]*?;\s+__Fort__)([^;"]+)/;
			sections.statblockText = sections.statblockText.replace(
				saves_regex, (match, preamble, savesSection) => {
				// Adjust skill values within the captured "Skills" section
				const updatedSavesSection = savesSection.replace(
					/(\+\d+)/g,
					(saveMatch: string) => {
						const value = parseInt(saveMatch, 10) + mod;
						return `+${value}`;
					}
				);
				return `${preamble}${updatedSavesSection}`;
				}
			);					

			// Adjust Perception - handle "legacy" PF2E perception format from TTRPG github bestiary
			const perception_regex = /("Perception"\n\s+desc:\s+"(Perception\s+)?\+)(\d+)/;
			match = sections.statblockText.match(perception_regex);
			let perception = 0;
			if (match) {
				perception = parseInt(match[3], 10) + mod;
			}			
			sections.statblockText = sections.statblockText.replace(perception_regex, (match, p1) => `${p1}${perception}`);			

			// Adjust skills
			sections.statblockText = sections.statblockText.replace(
				/(skills:\s+- name: "Skills"\s+desc: ")([^"]+)/,
				(match, preamble, skillsSection) => {
				// Adjust skill values within the captured "Skills" section
				const updatedSkillsSection = skillsSection.replace(
					/(\+\d+)/g,
					(skillMatch: string) => {
						const value = parseInt(skillMatch, 10) + mod;
						return `+${value}`;
					}
				);
				return `${preamble}${updatedSkillsSection}`;
				}
			);

			// Adjust attack mods
			const attacks_section_regex = /(attacks:\n\s+- name:)([\s\S]+)$/;
			sections.statblockText = sections.statblockText.replace(
				attacks_section_regex,
				(match, preamble, attacksSection) => {
				// Adjust attack mods that are simply "attack +X"
				let updatedAttacksSection = attacksSection.replace(
					/(attack )(\+\d+)/g,
					(attack: string, attack_preamble, attack_value:string) => {
						const value = parseInt(attack_value, 10) + mod;
						if (value < 0) {
							return `attack ${value}`;
						} else {
							return `attack +${value}`;
						}
					}
				);

				// Adjust attack mods that are like "`pf2e:1` Axe +X"
				updatedAttacksSection = updatedAttacksSection.replace(
					/(\s*desc: "`pf2:[^`]+` [^+]+)(\+\d+)/g,
					(attack: string, attack_preamble, attack_value:string) => {
						const value = parseInt(attack_value, 10) + mod;

						if (value < 0) {
							return `${attack_preamble}${value}`;
						} else {
							return `${attack_preamble}+${value}`;
						}
					}
				);

				// Adjust attack mods that are like "⬻ Axe +X"
				updatedAttacksSection = updatedAttacksSection.replace(
					/(\s*desc: "[^\s\d\w] [^+]+)(\+\d+)/g,
					(attack: string, attack_preamble, attack_value:string) => {
						const value = parseInt(attack_value, 10) + mod;

						if (value < 0) {
							return `${attack_preamble}${value}`;
						} else {
							return `${attack_preamble}+${value}`;
						}
					}
				);
				
				// Adjust damage for strikes and other offensives
				// Look for similar to "__Damage__ 1d6 + 12" 
				// const regex = /(\d+d\d+[\+\-]?\d*)\s*(?:\((\d+d\d+[\+\-]?\d*)\))?/;
				updatedAttacksSection = updatedAttacksSection.replace(
				  ///(__Damage__\s+\d+d\d+(\+\d+)?)(?:\s*\((\d+d\d+(\+\d+)?)\))?/g
					/(__Damage__\s+\d+d\d+)(\s*[\+-]?\s*)?(\d+)?(?:\s*\((\d+d\d+\s*[\+\-]?\s*\d*)?\))?/g,
					(attack: string, attack_preamble:string, attack_mod:string, attack_value:string, paren_attack:string) => {
						let value = 0;
						if (attack_value) {
							value = parseInt(attack_value, 10);
							if (attack_mod.includes('-')) {
								value = -value;
							}
						}
						value = value + mod;
						if (value == 0) {
							return `${attack_preamble}`;
						} else if (value < 0) {
							value = -value;
							return `${attack_preamble} - ${value}`;
						} else {
							return `${attack_preamble} + ${value}`;
						}
					}
				);

				// Look for other damage rolls (a die roll within 3 words before the word "damage")
				updatedAttacksSection = updatedAttacksSection.replace(
					/(\b\d+d\d+\b)(\s+[\+-]\s+)?(\d+)?(?=(?:\s+\w+){0,3}\s+damage)/g,
					(attack: string, attack_preamble, attack_mod, attack_value:string) => {
						let value = 0;
						if (attack_value) {
							value = parseInt(attack_value, 10);
							if (attack_mod.includes('-')) {
								value = -value;
							}
						}
						value = value + mod;
						if (value == 0) {
							return `${attack_preamble}`;
						} else if (value < 0) {
							value = -value;
							return `${attack_preamble} - ${value}`;
						} else {
							return `${attack_preamble} + ${value}`;
						}
					}
				);

				return `${preamble}${updatedAttacksSection}`;
				}
			);

			const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
			const currFile = markdownView?.file;
			const currentNoteFolderPath = currFile?.parent?.path;
			const newNoteFileName = name + name_suffix + ".md";
			const newNotePath = `${currentNoteFolderPath}/${newNoteFileName}`;
			const new_monster = sections.beforeStatblock + "```statblock\n" + sections.statblockText + "\n```\n" + sections.afterStatblock;
			try {
				await this.app.vault.create(newNotePath, new_monster);
				new Notice(newNoteFileName + " created.", 5000);
				this.app.workspace.openLinkText(newNoteFileName, newNotePath, true, { active: true });
			} catch (err) {
				console.error("Error creating new note:", err);
				new Notice('Failed to create note: ' + err, 5000);
			}
		} else {
			console.log("The note does not contain a properly formatted statblock section.");
			new Notice("The note does not contain a properly formatted statblock section.", 2000);
		}
	}
}

