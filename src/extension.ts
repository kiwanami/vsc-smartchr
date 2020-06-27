import * as vscode from 'vscode';
import { stringify } from 'querystring';

export function activate(context: vscode.ExtensionContext) {
	function registerCommandNice(commandId: string, run: (...args: any[]) => void): void {
		context.subscriptions.push(vscode.commands.registerCommand(commandId, run));
	}

	let controller = new SmartchrController();

	registerCommandNice('type', function (args) {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		controller.process(args.text, vscode.window.activeTextEditor);
	});

	registerCommandNice('extension.smartchr.cancel', function (args) {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		controller.cancel();
	});

	vscode.window.onDidChangeTextEditorSelection(event => {
		controller.moveCursor(event.textEditor, event.selections);
	});

	vscode.workspace.onDidChangeConfiguration(event => {
		let affected = event.affectsConfiguration("smartchr.definitions");
		if (affected) {
			controller.reload();
		}
	});
}

export type SCEditBuilder = {
	delete: (range: vscode.Range) => void,
	insert: (range: vscode.Position, text: string) => void,
};

export type SCEditBuilderBlock = (builder: SCEditBuilder) => void;

export type SCEditor = {
	selection: vscode.Selection,
	edit: (block: SCEditBuilderBlock) => Thenable<any>
};


export class SmartchrController {

	private keyMapDefs = new Map<string, Map<string, SmartchrDef[]>>();

	private lastKey: string | null = null;
	private lastDef: SmartchrDef | null = null;
	private lastEditor: SCEditor | null = null;
	private count: number = 0;
	private lastChar: number | null = null;
	private lastLine: number | null = null;


	private getLangID = () => {
		return vscode.window.activeTextEditor?.document.languageId;
	};
	private processDefault = (text: string) => {
		vscode.commands.executeCommand('default:type', { text: text });
	};

	constructor(testConfig: any = undefined) {
		if (testConfig) {
			this.loadConfig(testConfig.langs);
			this.getLangID = () => testConfig.langID;
			this.processDefault = (text: string) => testConfig.processDefault(text);
		} else {
			this.reload();
		}
	}

	private loadConfig(defConfig: any) {
		for (const id of Object.keys(defConfig)) {
			let keymap = new Map<string, SmartchrDef[]>();
			this.keyMapDefs.set(id, keymap);
			let langDefs = defConfig[id];
			for (const k of Object.keys(langDefs)) {
				let defs = langDefs[k].map((p: string) => parsePattern(p));
				keymap.set(k, defs);
			}
		}
	}

	reload(): void {
		let smartchrConfig = vscode.workspace.getConfiguration("smartchr");
		let defConfig: any = smartchrConfig.get("definitions");
		if (!defConfig) {
			return;
		}
		this.loadConfig(defConfig);
	}

	moveCursor(textEditor: vscode.TextEditor, selections: readonly vscode.Selection[]): void {
		if (this.lastChar === null && this.lastLine === null) {
			// do nothing just during smartchr expansion task
			return;
		}
		if (selections[0].active.character !== this.lastChar ||
			selections[0].active.line !== this.lastLine) {
			// determine changing cursor position after smartchr expansion
			this.cancel();
		}
	}

	public process(key: string, editor: SCEditor): Thenable<any> {
		let langid = this.getLangID();
		let defs = null;
		if (langid) {
			let keymap = this.keyMapDefs.get(langid);
			if (keymap) { defs = keymap.get(key); }
		}
		if (!defs) {
			this.cancel();
			this.processDefault(key);
			return Promise.resolve();
		}

		let isContinue = key === this.lastKey && editor === this.lastEditor;
		if (isContinue) {
			this.count++;
		} else {
			this.count = 0;
		}
		if (this.count >= defs.length) { this.count = 0; }
		let def = defs[this.count];
		let cursorDiff: number | void;
		return editor.edit((builder) => {
			if (isContinue && this.lastDef) {
				this.lastDef.cleanup(editor.selection.active, builder);
			}
			this.lastEditor = editor;
			this.lastKey = key;
			this.lastDef = def;
			cursorDiff = def.insert(editor.selection.active, builder);
			this.lastChar = null; // wait for fixing cursor position
			this.lastLine = null; 
		}).then(() => {
			let cpos = editor.selection.active;
			if (cursorDiff) {
				let npos = new vscode.Position(cpos.line, cpos.character + cursorDiff);
				editor.selection = new vscode.Selection(npos, npos);
			}
			this.lastChar = editor.selection.active.character;
			this.lastLine = editor.selection.active.line;
		});
	}

	public cancel(): void {
		this.lastKey = null;
		this.lastDef = null;
		this.lastEditor = null;
		this.count = 0;
	}
}


const CURSOR_TAG = '!!';

type SCEditFunction = (pos: vscode.Position, editor: SCEditBuilder) => number | void;

class SmartchrDef {
	private _cleanup: SCEditFunction;
	private _insert: SCEditFunction;
	constructor(cleanup: SCEditFunction, insert: SCEditFunction) {
		this._cleanup = cleanup;
		this._insert = insert;
	}
	public cleanup(pos: vscode.Position, editor: SCEditBuilder): number | void {
		return this._cleanup(pos, editor);
	}
	public insert(pos: vscode.Position, editor: SCEditBuilder): number | void {
		return this._insert(pos, editor);
	}
}

// 'F', '$', '$(!!)'
function parsePattern(template: string): SmartchrDef {
	if (template.indexOf(CURSOR_TAG) >= 0) {
		// cursor template
		let [pre, post] = template.split(CURSOR_TAG);
		let pren = pre.length, postn = post.length;
		return new SmartchrDef(
			function (pos: vscode.Position, editor: SCEditBuilder): void {
				editor.delete(new vscode.Range(pos.line, pos.character, pos.line, pos.character + postn));
				editor.delete(new vscode.Range(pos.line, pos.character - pren, pos.line, pos.character));
			},
			function (pos: vscode.Position, editor: SCEditBuilder): number {
				editor.insert(new vscode.Position(pos.line, pos.character), pre + post);
				return -post.length;
			},
		);
	} else {
		// simple template
		let len = template.length;
		return new SmartchrDef(
			function (pos: vscode.Position, editor: SCEditBuilder) {
				editor.delete(new vscode.Range(pos.line, pos.character - len, pos.line, pos.character));
			},
			function (pos: vscode.Position, editor: SCEditBuilder) {
				editor.insert(new vscode.Position(pos.line, pos.character), template);
			},
		);
	}
}

export function deactivate() { }
