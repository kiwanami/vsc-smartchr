import * as assert from 'assert';

import * as vscode from 'vscode';
import * as smartchr from '../../extension';

class TestEditor {
	constructor() {
		let pos = new vscode.Position(0, 0);
		this.selection = new vscode.Selection(pos, pos);
	}

	public selection: vscode.Selection;
	public insertList: Array<{ pos: vscode.Position, text: string }> = [];
	public deleteList: Array<vscode.Range> = [];
	public text: string = "";

	public edit(block: smartchr.SCEditBuilderBlock): Thenable<any> {
		block({
			delete: (range: vscode.Range) => {
				this.deleteList.push(range);
			},
			insert: (range: vscode.Position, text: string) => {
				this.insertList.push({ pos: range, text: text });
				this.text = text;
			}
		});
		let pos = new vscode.Position(0, this.insertList[this.insertList.length - 1].text.length);
		this.selection = new vscode.Selection(pos, pos);
		return Promise.resolve();
	}
}

suite('Extension Test Suite', () => {
	test('Test Normal Cases', async () => {
		let resultDefault = null;
		let config = {
			langID: "test",
			processDefault: (text: string | null) => { resultDefault = text; },
			langs: {
				test: {
					A: ["A", "AA", "===>!!<==="]
				}
			}
		};
		let controller = new smartchr.SmartchrController(config);
		let editor = new TestEditor();
		await controller.process("B", editor);
		assert.equal(editor.insertList.length, 0, "ignore other key: insert list");
		assert.equal(editor.deleteList.length, 0, "ignore other key: delete list");
		assert.equal(resultDefault, "B", "ignore other key: typed");

		await controller.process("A", editor);
		assert.equal(editor.insertList.length, 1, "First key: insert list");
		assert.equal(editor.deleteList.length, 0, "First key: delete list");
		assert.equal(editor.text, "A", "First key: typed");

		await controller.process("A", editor);
		assert.equal(editor.insertList.length, 2, "Second key: insert list");
		assert.equal(editor.deleteList.length, 1, "Second key: delete list");
		assert.equal(editor.text, "AA", "Second key: typed");

		await controller.process("A", editor);
		assert.equal(editor.insertList.length, 3, "Cursor template: insert list");
		assert.equal(editor.deleteList.length, 2, "Cursor template: delete list");
		assert.equal(editor.text, "===><===", "Cursor template: typed");
		assert.equal(editor.selection.active.character, 4, "Cursor template: cursor position");

		await controller.process("A", editor);
		assert.equal(editor.insertList.length, 4, "Counter reset: insert list");
		assert.equal(editor.deleteList.length, 4, "Counter reset: delete list");
		assert.equal(editor.text, "A", "Counter reset: typed");
	});
});
