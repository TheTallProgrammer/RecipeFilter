recipe_selectors = [
	'.recipe-callout',
	'.tasty-recipes',
	'.easyrecipe',
	'.innerrecipe',
	'.recipe-summary.wide', // thepioneerwoman.com
	'.wprm-recipe-container',
	'.recipe-content',
	'.simple-recipe-pro',
	'.mv-recipe-card',
	'div[itemtype="http://schema.org/Recipe"]',
	'div[itemtype="https://schema.org/Recipe"]',
    'div.recipediv',
]

const closeButton = document.createElement('button');
closeButton.id = '_rf_closebtn';
closeButton.classList.add('_rfbtn');
closeButton.textContent = 'close recipe';

const editButton = document.createElement('button');
editButton.id = '_rf_editbtn';
editButton.classList.add('_rfbtn');
editButton.textContent = 'edit recipe';

const saveMdButton = document.createElement('button');
saveMdButton.id = '_rf_savemd';
saveMdButton.classList.add('_rfbtn', '_rfbtn_small');
saveMdButton.textContent = 'save .md';

const saveDocxButton = document.createElement('button');
saveDocxButton.id = '_rf_savedocx';
saveDocxButton.classList.add('_rfbtn', '_rfbtn_small');
saveDocxButton.textContent = 'save .docx';

const disableButton = document.createElement('button');
disableButton.id = '_rf_disablebtn';
disableButton.classList.add('_rfbtn');
disableButton.textContent = 'disable on this site';

const controls = document.createElement('div');
controls.id  = '_rf_header';
controls.appendChild(closeButton);
controls.appendChild(editButton);
controls.appendChild(saveMdButton);
controls.appendChild(saveDocxButton);
controls.appendChild(document.createTextNode('Recipe Filter'));
controls.appendChild(disableButton);

let popupClone = null;
let matchedRecipe = null;
let editedNode = null;  // set after the user saves edits; becomes the source of truth

function mouseUpHide(e) {
	if (popupClone && e.target !== popupClone && !popupClone.contains(e.target) && e.target.type !== 'submit') {
		hidePopup();
	}
}

function escapeUpHide(e) {
	if (e.key === 'Escape') {
		hidePopup();
	}
}

function attachPopupListeners() {
	document.addEventListener('mouseup', mouseUpHide);
	document.addEventListener('keyup', escapeUpHide);
}

function detachPopupListeners() {
	document.removeEventListener('mouseup', mouseUpHide);
	document.removeEventListener('keyup', escapeUpHide);
}

function hidePopup(){
	detachPopupListeners();
	let highlight = document.getElementById('_rf_highlight');
	if (!highlight) return;
	highlight.style.transition = 'opacity 400ms';
	highlight.style.opacity = 0;

	setTimeout(function() {
		if (highlight.parentNode) highlight.parentNode.removeChild(highlight);
	}, 400);
}

function showPopup(){
	recipe_selectors.every(function(s){
		let original = document.querySelector(s);
		if (original){
			matchedRecipe = original;
			let clone = original.cloneNode(true);
			clone.id = '_rf_highlight';
			popupClone = clone;
			clone.prepend(controls);
            clone.style.transition = 'opacity 500ms';
			clone.style.display = 'block';
			clone.style.opacity = 0;
            clone.setAttribute('aria-live', 'assertive');

			document.body.insertBefore(clone, document.body.firstChild);

			closeButton.addEventListener('click', hidePopup);
			editButton.addEventListener('click', openEditor);
			saveMdButton.addEventListener('click', function(){ saveRecipe('md'); });
			saveDocxButton.addEventListener('click', function(){ saveRecipe('docx'); });
			disableButton.addEventListener('click', function(b){
				chrome.storage.sync.set({[document.location.hostname]: true}, hidePopup);
			});

			attachPopupListeners();

			window.setTimeout(() => {
				clone.style.opacity = 1;
				document.scrollingElement.scrollTop = 0;
			}, 10);

			return false;
		}
		return true;
	});
}

/* --- save / export -------------------------------------------------- */

function triggerDownload(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function saveRecipe(format) {
	const source = (editedNode || matchedRecipe).cloneNode(true);
	if (format === 'md') {
		triggerDownload(new Blob([htmlToMarkdown(source)], { type: 'text/markdown' }), 'recipe.md');
	} else {
		triggerDownload(makeDocxBlob(domToWordBody(source)), 'recipe.docx');
	}
}

function htmlToMarkdown(el) {
	function walk(node, fmt) {
		if (node.nodeType === 3) return node.textContent;
		const tag = node.tagName ? node.tagName.toLowerCase() : '';
		const inner = () => Array.from(node.childNodes).map(n => walk(n, fmt)).join('');
		switch (tag) {
			case 'h1': return '\n# '   + inner().trim() + '\n';
			case 'h2': return '\n## '  + inner().trim() + '\n';
			case 'h3': return '\n### ' + inner().trim() + '\n';
			case 'h4': return '\n#### '+ inner().trim() + '\n';
			case 'p':  return '\n' + inner().trim() + '\n';
			case 'br': return '\n';
			case 'hr': return '\n---\n';
			case 'strong': case 'b': return '**' + inner() + '**';
			case 'em':    case 'i': return '*'  + inner() + '*';
			case 'li': {
				const isOl = node.parentElement && node.parentElement.tagName.toLowerCase() === 'ol';
				const prefix = isOl
					? (Array.from(node.parentElement.children).indexOf(node) + 1) + '. '
					: '- ';
				return '\n' + prefix + inner().trim();
			}
			case 'ul': case 'ol': return '\n' + inner() + '\n';
			case 'mark': return '==' + inner() + '==';
			default: {
				if (node.style && node.style.backgroundColor) return '==' + inner() + '==';
				return inner();
			}
		}
	}
	return walk(el, {}).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function escapeXML(s) {
	return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function bgToOoxmlHighlight(css) {
	const map = {
		'rgb(255, 224, 102)': 'yellow',
		'rgb(144, 238, 144)': 'green',
		'rgb(135, 206, 235)': 'cyan',
		'rgb(255, 182, 193)': 'magenta',
		'rgb(255, 213, 128)': 'darkYellow',
		'yellow': 'yellow', 'cyan': 'cyan',
	};
	return map[css] || null;
}

function domToWordBody(rootEl) {
	let xml = '';

	function getRuns(node, fmt) {
		fmt = fmt || {};
		if (node.nodeType === 3) {
			const text = node.textContent;
			if (!text) return '';
			const hl = fmt.highlight ? `<w:highlight w:val="${fmt.highlight}"/>` : '';
			const rPr = [
				fmt.bold      ? '<w:b/>'                : '',
				fmt.italic    ? '<w:i/>'                : '',
				fmt.underline ? '<w:u w:val="single"/>' : '',
				fmt.strike    ? '<w:strike/>'           : '',
				hl,
			].join('');
			return `<w:r>${rPr ? '<w:rPr>' + rPr + '</w:rPr>' : ''}<w:t xml:space="preserve">${escapeXML(text)}</w:t></w:r>`;
		}
		const tag = node.tagName ? node.tagName.toLowerCase() : '';
		const bg = node.style && bgToOoxmlHighlight(node.style.backgroundColor);
		const next = Object.assign({}, fmt, {
			bold:      fmt.bold      || tag === 'strong' || tag === 'b',
			italic:    fmt.italic    || tag === 'em'     || tag === 'i',
			underline: fmt.underline || tag === 'u',
			strike:    fmt.strike    || tag === 's'      || tag === 'strike',
			highlight: bg || fmt.highlight,
		});
		return Array.from(node.childNodes).map(n => getRuns(n, next)).join('');
	}

	function para(style, runs) {
		const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
		return `<w:p>${pPr}${runs}</w:p>`;
	}

	function listPara(numId, runs) {
		return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${runs}</w:p>`;
	}

	function walk(node) {
		if (node.nodeType === 3) {
			const text = node.textContent.trim();
			if (text) xml += para('', `<w:r><w:t xml:space="preserve">${escapeXML(text)}</w:t></w:r>`);
			return;
		}
		const tag = node.tagName ? node.tagName.toLowerCase() : '';
		switch (tag) {
			case 'h1': xml += para('Heading1', getRuns(node)); break;
			case 'h2': xml += para('Heading2', getRuns(node)); break;
			case 'h3': xml += para('Heading3', getRuns(node)); break;
			case 'h4': xml += para('Heading4', getRuns(node)); break;
			case 'p':  xml += para('', getRuns(node)); break;
			case 'br': xml += '<w:p/>'; break;
			case 'hr': xml += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>'; break;
			case 'li': {
				const isOl = node.parentElement && node.parentElement.tagName.toLowerCase() === 'ol';
				xml += listPara(isOl ? 2 : 1, getRuns(node));
				break;
			}
			case 'ul': case 'ol':
				Array.from(node.children).forEach(walk);
				break;
			default:
				Array.from(node.childNodes).forEach(walk);
		}
	}

	Array.from(rootEl.childNodes).forEach(walk);
	return xml;
}

function makeDocxBlob(bodyXML) {
	const crcTbl = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		crcTbl[i] = c;
	}
	function crc32(buf) {
		let c = 0xFFFFFFFF;
		for (const b of buf) c = crcTbl[(c ^ b) & 0xFF] ^ (c >>> 8);
		return (c ^ 0xFFFFFFFF) >>> 0;
	}
	function u16(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
	function u32(n) { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }

	const enc = new TextEncoder();
	const files = [
		{ name: '[Content_Types].xml', data: enc.encode(
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
			'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
			'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
			'<Default Extension="xml" ContentType="application/xml"/>' +
			'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
			'<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
			'</Types>'
		)},
		{ name: '_rels/.rels', data: enc.encode(
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
			'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
			'</Relationships>'
		)},
		{ name: 'word/_rels/document.xml.rels', data: enc.encode(
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
			'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
			'</Relationships>'
		)},
		{ name: 'word/numbering.xml', data: enc.encode(
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
			'<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
			'<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#x2022;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>' +
			'<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>' +
			'<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
			'<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>' +
			'</w:numbering>'
		)},
		{ name: 'word/document.xml', data: enc.encode(
			'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
			'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
			'<w:body>' + bodyXML +
			'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
			'</w:body></w:document>'
		)},
	];

	// build stored (uncompressed) ZIP
	const localHeaders = [];
	const parts = [];
	let offset = 0;

	for (const file of files) {
		const name = enc.encode(file.name);
		const crc = crc32(file.data);
		const size = file.data.length;
		const local = new Uint8Array(30 + name.length);
		let i = 0;
		const w = bytes => { for (const b of bytes) local[i++] = b; };
		w([0x50,0x4B,0x03,0x04]); w(u16(20)); w(u16(0)); w(u16(0));
		w(u16(0)); w(u16(0)); w(u32(crc)); w(u32(size)); w(u32(size));
		w(u16(name.length)); w(u16(0));
		for (const b of name) local[i++] = b;
		localHeaders.push({ name, crc, size, offset });
		parts.push(local, file.data);
		offset += local.length + size;
	}

	const centralParts = [];
	let centralSize = 0;
	for (let f = 0; f < files.length; f++) {
		const { name, crc, size, offset: off } = localHeaders[f];
		const central = new Uint8Array(46 + name.length);
		let i = 0;
		const w = bytes => { for (const b of bytes) central[i++] = b; };
		w([0x50,0x4B,0x01,0x02]); w(u16(20)); w(u16(20)); w(u16(0)); w(u16(0));
		w(u16(0)); w(u16(0)); w(u32(crc)); w(u32(size)); w(u32(size));
		w(u16(name.length)); w(u16(0)); w(u16(0)); w(u16(0)); w(u16(0));
		w(u32(0)); w(u32(off));
		for (const b of name) central[i++] = b;
		centralParts.push(central);
		centralSize += central.length;
	}

	const eocd = new Uint8Array(22);
	let i = 0;
	const w = bytes => { for (const b of bytes) eocd[i++] = b; };
	w([0x50,0x4B,0x05,0x06]); w(u16(0)); w(u16(0));
	w(u16(files.length)); w(u16(files.length));
	w(u32(centralSize)); w(u32(offset)); w(u16(0));

	const all = [...parts, ...centralParts, eocd];
	const total = all.reduce((s, a) => s + a.length, 0);
	const out = new Uint8Array(total);
	let pos = 0;
	for (const a of all) { out.set(a, pos); pos += a.length; }

	return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* --- editor --------------------------------------------------------- */

let editorContent = null;
let editorStyle = null;
let editorZoom = 1;

// recipe elements set their own line-height/letter-spacing, so we have to
// override every descendant with !important rather than just the container.
function updateSpacing(lineHeight, letterSpacing) {
	if (!editorStyle) return;
	editorStyle.textContent =
		'#_rf_editor_content, #_rf_editor_content * {' +
		'line-height:' + lineHeight + ' !important;' +
		'letter-spacing:' + letterSpacing + 'px !important;' +
		'}';
}

function applyCommand(cmd) {
	document.execCommand(cmd, false, null);
	editorContent.focus();
}

function applyBlock(tag) {
	document.execCommand('formatBlock', false, tag);
	editorContent.focus();
}

function applyZoom(delta) {
	editorZoom = Math.min(2.5, Math.max(0.5, editorZoom + delta));
	editorContent.style.zoom = editorZoom;
}

function applyHighlight(color) {
	document.execCommand('styleWithCSS', false, true);
	document.execCommand('hiliteColor', false, color === 'remove' ? 'rgba(0,0,0,0)' : color);
	editorContent.focus();
}

function saveEdits() {
	const recipeEl = editorContent && editorContent.firstElementChild;
	if (!recipeEl) return;
	editedNode = recipeEl.cloneNode(true);

	if (!popupClone) return;
	// replace popup content (everything after our header) with the edited version
	while (popupClone.childNodes.length > 1) popupClone.removeChild(popupClone.lastChild);
	Array.from(editedNode.childNodes).forEach(n => popupClone.appendChild(n.cloneNode(true)));
}

function closeEditor() {
	const overlay = document.getElementById('_rf_editor_overlay');
	if (overlay) overlay.parentNode.removeChild(overlay);
	editorStyle = null;
	document.documentElement.classList.remove('_rf_editing');
	document.removeEventListener('keyup', editorEscape);

	if (popupClone && document.body.contains(popupClone)) {
		popupClone.style.display = 'block';
		attachPopupListeners();
	}
}

function editorEscape(e) {
	if (e.key === 'Escape') closeEditor();
}

function openEditor() {
	if (!matchedRecipe) return;

	// the popup's click-outside/escape handlers would fight the editor
	detachPopupListeners();
	if (popupClone) popupClone.style.display = 'none';

	const overlay = document.createElement('div');
	overlay.id = '_rf_editor_overlay';

	const win = document.createElement('div');
	win.id = '_rf_editor_window';

	const toolbar = document.createElement('div');
	toolbar.id = '_rf_editor_toolbar';
	toolbar.innerHTML = `
		<div class="_rf_ed_group">
			<button data-cmd="bold" title="Bold"><b>B</b></button>
			<button data-cmd="italic" title="Italic"><i>I</i></button>
			<button data-cmd="underline" title="Underline"><span style="text-decoration:underline">U</span></button>
			<button data-cmd="strikeThrough" title="Strikethrough"><span style="text-decoration:line-through">S</span></button>
		</div>
		<div class="_rf_ed_group">
			<button data-block="H1" title="Heading">H1</button>
			<button data-block="H2" title="Subheading">H2</button>
			<button data-block="P" title="Normal text">&para;</button>
		</div>
		<div class="_rf_ed_group">
			<button data-cmd="insertUnorderedList" title="Bulleted list">&bull; List</button>
			<button data-cmd="insertOrderedList" title="Numbered list">1. List</button>
		</div>
		<div class="_rf_ed_group">
			<button data-cmd="justifyLeft" title="Align left">&#8676;</button>
			<button data-cmd="justifyCenter" title="Align center">&#8633;</button>
			<button data-cmd="justifyRight" title="Align right">&#8677;</button>
		</div>
		<div class="_rf_ed_group">
			<span class="_rf_ed_label">Size</span>
			<button data-zoom="-0.1" title="Smaller text">A&minus;</button>
			<button data-zoom="0.1" title="Larger text">A&plus;</button>
		</div>
		<div class="_rf_ed_group">
			<label class="_rf_ed_slider">Line&nbsp;&#8597;
				<input type="range" id="_rf_ed_line" min="1" max="3" step="0.05" value="1.5">
			</label>
		</div>
		<div class="_rf_ed_group">
			<label class="_rf_ed_slider">Letter&nbsp;&#8596;
				<input type="range" id="_rf_ed_letter" min="-1" max="8" step="0.2" value="0">
			</label>
		</div>
		<div class="_rf_ed_group">
			<span class="_rf_ed_label">Highlight</span>
			<button class="_rf_ed_color" data-highlight="#FFE066" title="Yellow"></button>
			<button class="_rf_ed_color" data-highlight="#90EE90" title="Green"></button>
			<button class="_rf_ed_color" data-highlight="#87CEEB" title="Blue"></button>
			<button class="_rf_ed_color" data-highlight="#FFB6C1" title="Pink"></button>
			<button class="_rf_ed_color" data-highlight="#FFD580" title="Orange"></button>
			<button data-highlight="remove" title="Remove highlight">&#10005;</button>
		</div>
	`;

	editorContent = document.createElement('div');
	editorContent.id = '_rf_editor_content';
	editorContent.setAttribute('contenteditable', 'true');
	editorContent.setAttribute('spellcheck', 'false');
	editorZoom = 1;
	// use prior saved edits if they exist, otherwise the original
	editorContent.appendChild((editedNode || matchedRecipe).cloneNode(true));

	// strip print/pin buttons — useless inside the editor
	editorContent.querySelectorAll('button, a, [role="button"]').forEach(el => {
		const t = el.textContent.toLowerCase();
		if (t.includes('print') || t.includes('pin recipe')) el.remove();
	});

	editorStyle = document.createElement('style');
	editorStyle.id = '_rf_editor_style';

	const actions = document.createElement('div');
	actions.id = '_rf_editor_actions';

	const hint = document.createElement('span');
	hint.id = '_rf_editor_hint';
	hint.textContent = 'Click anywhere to edit · nothing leaves your browser';

	const saveMdBtn = document.createElement('button');
	saveMdBtn.className = '_rf_ed_action';
	saveMdBtn.textContent = 'Save .md';

	const saveDocxBtn = document.createElement('button');
	saveDocxBtn.className = '_rf_ed_action';
	saveDocxBtn.textContent = 'Save .docx';

	const printBtn = document.createElement('button');
	printBtn.className = '_rf_ed_action';
	printBtn.textContent = 'Print';

	const doneBtn = document.createElement('button');
	doneBtn.className = '_rf_ed_action _rf_ed_primary';
	doneBtn.textContent = 'Done';

	actions.appendChild(hint);
	actions.appendChild(saveMdBtn);
	actions.appendChild(saveDocxBtn);
	actions.appendChild(printBtn);
	actions.appendChild(doneBtn);

	win.appendChild(editorStyle);
	win.appendChild(toolbar);
	win.appendChild(editorContent);
	win.appendChild(actions);
	overlay.appendChild(win);
	document.body.appendChild(overlay);
	document.documentElement.classList.add('_rf_editing');

	toolbar.querySelectorAll('[data-highlight]:not([data-highlight="remove"])').forEach(btn => {
		btn.style.setProperty('background', btn.dataset.highlight, 'important');
	});

	// don't let toolbar clicks steal the text selection
	toolbar.addEventListener('mousedown', function(e){
		if (e.target.closest('button')) e.preventDefault();
	});

	toolbar.addEventListener('click', function(e){
		const btn = e.target.closest('button');
		if (!btn) return;
		if (btn.dataset.cmd) applyCommand(btn.dataset.cmd);
		else if (btn.dataset.block) applyBlock(btn.dataset.block);
		else if (btn.dataset.zoom) applyZoom(parseFloat(btn.dataset.zoom));
		else if (btn.dataset.highlight) applyHighlight(btn.dataset.highlight);
	});

	const lineInput = toolbar.querySelector('#_rf_ed_line');
	const letterInput = toolbar.querySelector('#_rf_ed_letter');
	lineInput.addEventListener('input', function(){ updateSpacing(lineInput.value, letterInput.value); });
	letterInput.addEventListener('input', function(){ updateSpacing(lineInput.value, letterInput.value); });

	saveMdBtn.addEventListener('click', function(){ saveRecipe('md'); });
	saveDocxBtn.addEventListener('click', function(){ saveRecipe('docx'); });
	printBtn.addEventListener('click', function(){ window.print(); });
	doneBtn.addEventListener('click', function(){ saveEdits(); closeEditor(); });

	overlay.addEventListener('mousedown', function(e){
		if (e.target === overlay) closeEditor();
	});

	document.addEventListener('keyup', editorEscape);

	editorContent.focus();
}

chrome.storage.sync.get(document.location.hostname, function(items) {
	if (!(document.location.hostname in items)) {
		showPopup();
	}
});
