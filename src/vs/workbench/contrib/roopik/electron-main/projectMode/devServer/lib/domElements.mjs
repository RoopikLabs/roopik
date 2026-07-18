/*---------------------------------------------------------------------------------------------
 *  AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 *  Generated from @mdn/browser-compat-data
 *  Run: node build/scripts/generateDOMWhitelist.mjs
 *---------------------------------------------------------------------------------------------*/

/**
 * Valid DOM elements that support data-* attributes.
 * Includes: HTML, SVG, MathML elements (excluding non-visual tags like script, style, head)
 *
 * Generated: 2026-01-28T00:56:09.593Z
 * Source: @mdn/browser-compat-data
 * Total: 214 elements
 */
export const DOM_ELEMENTS = new Set([
	'a',
	'abbr',
	'acronym',
	'address',
	'animate',
	'animatemotion',
	'animatetransform',
	'annotation',
	'annotation-xml',
	'area',
	'article',
	'aside',
	'audio',
	'b',
	'bdi',
	'bdo',
	'big',
	'blockquote',
	'body',
	'br',
	'button',
	'canvas',
	'caption',
	'center',
	'circle',
	'cite',
	'clippath',
	'code',
	'col',
	'colgroup',
	'data',
	'datalist',
	'dd',
	'defs',
	'del',
	'desc',
	'details',
	'dfn',
	'dialog',
	'dir',
	'div',
	'dl',
	'dt',
	'ellipse',
	'em',
	'embed',
	'feblend',
	'fecolormatrix',
	'fecomponenttransfer',
	'fecomposite',
	'feconvolvematrix',
	'fediffuselighting',
	'fedisplacementmap',
	'fedistantlight',
	'fedropshadow',
	'feflood',
	'fefunca',
	'fefuncb',
	'fefuncg',
	'fefuncr',
	'fegaussianblur',
	'feimage',
	'femerge',
	'femergenode',
	'femorphology',
	'fencedframe',
	'feoffset',
	'fepointlight',
	'fespecularlighting',
	'fespotlight',
	'fetile',
	'feturbulence',
	'fieldset',
	'figcaption',
	'figure',
	'filter',
	'font',
	'footer',
	'foreignobject',
	'form',
	'frame',
	'frameset',
	'g',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hgroup',
	'hr',
	'i',
	'iframe',
	'image',
	'img',
	'input',
	'ins',
	'kbd',
	'label',
	'legend',
	'li',
	'line',
	'lineargradient',
	'maction',
	'main',
	'map',
	'mark',
	'marker',
	'marquee',
	'mask',
	'math',
	'menclose',
	'menu',
	'merror',
	'metadata',
	'meter',
	'mfenced',
	'mfrac',
	'mi',
	'mmultiscripts',
	'mn',
	'mo',
	'mover',
	'mpadded',
	'mpath',
	'mphantom',
	'mprescripts',
	'mroot',
	'mrow',
	'ms',
	'mspace',
	'msqrt',
	'mstyle',
	'msub',
	'msubsup',
	'msup',
	'mtable',
	'mtd',
	'mtext',
	'mtr',
	'munder',
	'munderover',
	'nav',
	'nobr',
	'noembed',
	'noframes',
	'object',
	'ol',
	'optgroup',
	'option',
	'output',
	'p',
	'param',
	'path',
	'pattern',
	'picture',
	'plaintext',
	'polygon',
	'polyline',
	'pre',
	'progress',
	'q',
	'radialgradient',
	'rb',
	'rect',
	'rp',
	'rt',
	'rtc',
	'ruby',
	's',
	'samp',
	'search',
	'section',
	'select',
	'selectedcontent',
	'semantics',
	'set',
	'slot',
	'small',
	'source',
	'span',
	'stop',
	'strike',
	'strong',
	'sub',
	'summary',
	'sup',
	'svg',
	'switch',
	'symbol',
	'table',
	'tbody',
	'td',
	'template',
	'text',
	'textarea',
	'textpath',
	'tfoot',
	'th',
	'thead',
	'time',
	'tr',
	'track',
	'tspan',
	'tt',
	'u',
	'ul',
	'use',
	'var',
	'video',
	'view',
	'wbr',
	'xmp'
]);

/**
 * Check if element is a valid DOM element that supports data-* attributes.
 * Includes: HTML, SVG, MathML, and Web Components (custom elements with hyphens)
 * Excludes: React components, R3F/Three.js elements, library elements
 *
 * @param {string} name - Element name (case-sensitive for React JSX)
 * @returns {boolean}
 */
export function isDOMElement(name) {
	if (!name || typeof name !== 'string') return false;

	// Skip JSX fragments (<> or React.Fragment)
	if (name === '' || name === 'Fragment' || name === 'React.Fragment') {
		return false;
	}

	// Skip namespaced elements (Foo.Bar, Icons.Home)
	if (name.includes('.')) {
		return false;
	}

	// In JSX, tags starting with uppercase are ALWAYS components, never DOM elements
	// Examples: <Button>, <Canvas>, <MyComponent>, <UserProfile>
	// Note: SVG camelCase elements (clipPath, linearGradient) start with lowercase
	const firstChar = name.charAt(0);
	if (firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
		return false; // PascalCase = React component
	}

	const lowerName = name.toLowerCase();

	// 1. Standard DOM elements (HTML, SVG, MathML)
	if (DOM_ELEMENTS.has(lowerName)) {
		return true;
	}

	// 2. Custom Elements / Web Components
	// Per W3C spec, custom elements MUST contain a hyphen
	// This safely includes <my-navbar>, <sl-button>, <cal-link>
	// while excluding Three.js (<mesh>, <boxGeometry>) which never have hyphens
	if (name.includes('-') && /^[a-z]/.test(name)) {
		return true;
	}

	// 3. Everything else: React components (<Button>), R3F (<mesh>), etc.
	return false;
}
