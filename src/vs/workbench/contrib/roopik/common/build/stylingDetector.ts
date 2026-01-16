/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Styling Detector
 *
 * Detects third-party styling libraries used in component code.
 * This enables conditional injection of required CSS/scripts in the sandbox.
 *
 * Designed to be extensible - add new library configs as needed.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Styling library that may require additional sandbox setup
 */
export interface StylingLibrary {
	/** Unique identifier for the library */
	id: string;

	/** Human-readable name */
	name: string;

	/** Detection patterns (code patterns that indicate this library is used) */
	patterns: RegExp[];

	/** NPM package patterns (imports that indicate this library) */
	packagePatterns: RegExp[];

	/**
	 * Priority for detection (higher = checked first)
	 * Useful when libraries overlap (e.g., shadcn uses Tailwind)
	 */
	priority: number;
}

/**
 * Result of styling detection
 */
export interface StylingDetectionResult {
	/** Whether Tailwind CSS is used (classes like p-4, flex, bg-blue-500) */
	usesTailwind: boolean;

	/** Whether shadcn/ui patterns are detected */
	usesShadcn: boolean;

	/** All detected styling libraries */
	detectedLibraries: string[];
}

// ============================================================================
// Library Configurations
// ============================================================================

/**
 * Tailwind CSS detection patterns
 *
 * Tailwind uses utility classes like:
 * - Spacing: p-4, m-2, px-8, my-auto
 * - Flexbox/Grid: flex, grid, items-center, justify-between
 * - Colors: bg-blue-500, text-gray-900, border-red-200
 * - Typography: text-sm, font-bold, leading-tight
 * - Layout: w-full, h-screen, max-w-lg
 * - Effects: shadow-lg, rounded-md, opacity-50
 */
const TAILWIND_CONFIG: StylingLibrary = {
	id: 'tailwind',
	name: 'Tailwind CSS',
	priority: 100,
	patterns: [
		// JSX attributes: className="..." or class="..."
		/class(?:Name)?=["'][^"']*(?:flex|grid|inline-flex|inline-grid|block|inline-block|hidden)\b/,
		/class(?:Name)?=["'][^"']*(?:p-\d|m-\d|px-|py-|mx-|my-|pt-|pb-|pl-|pr-|mt-|mb-|ml-|mr-)/,
		/class(?:Name)?=["'][^"']*(?:bg-|text-|border-|ring-|shadow-|rounded)/,
		/class(?:Name)?=["'][^"']*(?:w-|h-|min-w-|min-h-|max-w-|max-h-)/,
		/class(?:Name)?=["'][^"']*(?:gap-|space-x-|space-y-)/,
		/class(?:Name)?=["'][^"']*(?:items-|justify-|self-|place-)/,
		/class(?:Name)?=["'][^"']*(?:font-|text-(?:xs|sm|base|lg|xl|2xl|3xl)|leading-|tracking-)/,
		/class(?:Name)?=["'][^"']*(?:opacity-|z-\d|overflow-|cursor-)/,

		// Bundled code: { className: "..." } (ESBuild output)
		/class(?:Name)?:\s*["'][^"']*(?:flex|grid|inline-flex|inline-grid|block|inline-block|hidden)\b/,
		/class(?:Name)?:\s*["'][^"']*(?:p-\d|m-\d|px-|py-|mx-|my-|pt-|pb-|pl-|pr-|mt-|mb-|ml-|mr-)/,
		/class(?:Name)?:\s*["'][^"']*(?:bg-|text-|border-|ring-|shadow-|rounded)/,
		/class(?:Name)?:\s*["'][^"']*(?:w-|h-|min-w-|min-h-|max-w-|max-h-)/,

		// Template literals with Tailwind
		/`[^`]*(?:flex|grid|p-\d|m-\d|bg-|text-|rounded|shadow|w-|h-)[^`]*`/,
		// cn() utility (shadcn's clsx + tailwind-merge wrapper)
		/\bcn\s*\(/,
		// Direct clsx/cva usage with Tailwind patterns
		/(?:clsx|cva)\s*\([^)]*(?:flex|grid|p-\d|bg-|text-|rounded)/,
	],
	packagePatterns: [
		/^tailwindcss$/,
		/^@tailwindcss\//,
	],
};

/**
 * shadcn/ui detection patterns
 *
 * shadcn uses:
 * - cn() utility function
 * - CSS variables (--border, --background, --primary, etc.)
 * - Radix UI primitives
 * - Specific component patterns
 */
const SHADCN_CONFIG: StylingLibrary = {
	id: 'shadcn',
	name: 'shadcn/ui',
	priority: 90,
	patterns: [
		// cn() is THE defining pattern of shadcn
		/\bcn\s*\(/,
		// cva (class-variance-authority) for variants
		/\bcva\s*\(/,
		// CSS variable usage for shadcn theming
		/(?:hsl|var)\s*\(\s*(?:--background|--foreground|--primary|--secondary|--muted|--accent|--destructive|--border|--ring|--radius)/,
		// Common shadcn component exports
		/(?:buttonVariants|badgeVariants|alertVariants)/,
		// Slot component from Radix
		/(?:Slot|SlotProps)/,
	],
	packagePatterns: [
		/^class-variance-authority$/,
		/^clsx$/,
		/^tailwind-merge$/,
		/^@radix-ui\//,
	],
};

/**
 * Material UI detection patterns (for future use - currently auto-handled by esm.sh)
 */
const MUI_CONFIG: StylingLibrary = {
	id: 'mui',
	name: 'Material UI',
	priority: 80,
	patterns: [
		// MUI's sx prop
		/\bsx\s*=\s*\{/,
		// styled() API
		/\bstyled\s*\(/,
		// MUI theme usage
		/useTheme\s*\(/,
		/ThemeProvider/,
	],
	packagePatterns: [
		/^@mui\//,
		/^@material-ui\//,
	],
};

/**
 * Chakra UI detection patterns (for future use)
 */
const CHAKRA_CONFIG: StylingLibrary = {
	id: 'chakra',
	name: 'Chakra UI',
	priority: 80,
	patterns: [
		/ChakraProvider/,
		/useColorMode/,
		/useColorModeValue/,
	],
	packagePatterns: [
		/^@chakra-ui\//,
	],
};

/**
 * Ant Design detection patterns (for future use)
 */
const ANTD_CONFIG: StylingLibrary = {
	id: 'antd',
	name: 'Ant Design',
	priority: 80,
	patterns: [
		/ConfigProvider/,
		/\btheme\s*[:=]\s*\{[^}]*token/,
	],
	packagePatterns: [
		/^antd$/,
		/^@ant-design\//,
	],
};

// ============================================================================
// Detection Registry
// ============================================================================

/**
 * All registered styling libraries
 * Sorted by priority (highest first)
 */
const STYLING_LIBRARIES: StylingLibrary[] = [
	TAILWIND_CONFIG,
	SHADCN_CONFIG,
	MUI_CONFIG,
	CHAKRA_CONFIG,
	ANTD_CONFIG,
].sort((a, b) => b.priority - a.priority);

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect styling libraries used in component code
 *
 * @param code The bundled or source code to analyze
 * @param imports Optional list of import statements for faster detection
 * @returns Detection result with flags for each library type
 */
export function detectStylingLibraries(code: string, imports?: string[]): StylingDetectionResult {
	const detectedLibraries: string[] = [];

	for (const library of STYLING_LIBRARIES) {
		let detected = false;

		// Check package patterns first (faster)
		if (imports) {
			for (const pattern of library.packagePatterns) {
				if (imports.some(imp => pattern.test(imp))) {
					detected = true;
					break;
				}
			}
		}

		// Check code patterns if not detected via imports
		if (!detected) {
			for (const pattern of library.patterns) {
				if (pattern.test(code)) {
					detected = true;
					break;
				}
			}
		}

		if (detected) {
			detectedLibraries.push(library.id);
		}
	}

	return {
		usesTailwind: detectedLibraries.includes('tailwind') || detectedLibraries.includes('shadcn'),
		usesShadcn: detectedLibraries.includes('shadcn'),
		detectedLibraries,
	};
}

/**
 * Quick check if code uses Tailwind CSS
 * Optimized for speed - stops at first match
 *
 * @param code The code to check
 * @returns true if Tailwind patterns are detected
 */
export function usesTailwindCSS(code: string): boolean {
	// Fast check: look for common Tailwind class patterns
	// These are the most common patterns that indicate Tailwind usage
	// Handles both JSX source (className="...") and bundled code (className: "...")
	const fastPatterns = [
		// JSX source format
		/class(?:Name)?=["'][^"']*(?:flex|grid|p-\d|m-\d|bg-|text-(?:sm|lg|xl)|rounded|shadow|w-|h-)/,
		// Bundled code format (object literals)
		/class(?:Name)?:\s*["'][^"']*(?:flex|grid|p-\d|m-\d|bg-|text-(?:sm|lg|xl)|rounded|shadow|w-|h-)/,
		// Utility functions
		/\bcn\s*\(/,
		/\bclsx\s*\(/,
	];

	for (const pattern of fastPatterns) {
		if (pattern.test(code)) {
			return true;
		}
	}

	return false;
}

/**
 * Extract all Tailwind classes from code (for future optimization)
 * Could be used to generate minimal CSS with only used classes
 *
 * @param code The code to analyze
 * @returns Array of unique Tailwind class names
 */
export function extractTailwindClasses(code: string): string[] {
	const classPattern = /class(?:Name)?=["']([^"']+)["']/g;
	const cnPattern = /cn\s*\(\s*["']([^"']+)["']/g;
	const templatePattern = /`([^`]*(?:flex|grid|p-\d|bg-)[^`]*)`/g;

	const classes = new Set<string>();

	const extractFromMatch = (match: RegExpMatchArray) => {
		const classString = match[1];
		classString.split(/\s+/).forEach(cls => {
			if (cls && /^[a-z]/.test(cls)) {
				classes.add(cls);
			}
		});
	};

	let match;
	while ((match = classPattern.exec(code)) !== null) {
		extractFromMatch(match);
	}
	while ((match = cnPattern.exec(code)) !== null) {
		extractFromMatch(match);
	}
	while ((match = templatePattern.exec(code)) !== null) {
		extractFromMatch(match);
	}

	return Array.from(classes);
}
