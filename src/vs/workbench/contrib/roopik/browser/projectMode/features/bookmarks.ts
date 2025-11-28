/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { INotificationService, Severity } from '../../../../../../platform/notification/common/notification.js';
import { ILogger } from '../../../../../../platform/log/common/log.js';
import { BrowserBookmark } from '../components/browserControlBar.js';

/**
 * Storage key for browser bookmarks (workspace-scoped)
 */
const BOOKMARKS_STORAGE_KEY = 'roopik.browser.bookmarks';

/**
 * Bookmarks Feature
 *
 * Manages browser bookmarks with workspace-scoped storage.
 * Each project has its own set of bookmarks.
 */
export class Bookmarks {
	private bookmarks: BrowserBookmark[] = [];

	constructor(
		private readonly storageService: IStorageService,
		private readonly notificationService: INotificationService,
		private readonly logger: ILogger
	) {
		this.load();
	}

	/**
	 * Load bookmarks from workspace storage
	 */
	private load(): void {
		try {
			const stored = this.storageService.get(BOOKMARKS_STORAGE_KEY, StorageScope.WORKSPACE);
			if (stored) {
				this.bookmarks = JSON.parse(stored) as BrowserBookmark[];
				this.logger.debug(`[Bookmarks] Loaded ${this.bookmarks.length} bookmarks from workspace storage`);
			}
		} catch (error) {
			this.logger.warn('[Bookmarks] Failed to load bookmarks:', error);
			this.bookmarks = [];
		}
	}

	/**
	 * Save bookmarks to workspace storage
	 */
	private save(): void {
		try {
			this.storageService.store(
				BOOKMARKS_STORAGE_KEY,
				JSON.stringify(this.bookmarks),
				StorageScope.WORKSPACE,
				StorageTarget.USER
			);
			this.logger.debug(`[Bookmarks] Saved ${this.bookmarks.length} bookmarks to workspace storage`);
		} catch (error) {
			this.logger.error('[Bookmarks] Failed to save bookmarks:', error);
		}
	}

	/**
	 * Add a bookmark
	 */
	add(bookmark: BrowserBookmark): void {
		// Don't add duplicates
		if (this.isBookmarked(bookmark.url)) {
			return;
		}
		this.bookmarks.push(bookmark);
		this.save();
		this.notificationService.notify({
			severity: Severity.Info,
			message: `Bookmarked: ${bookmark.title}`,
			sticky: false
		});
	}

	/**
	 * Remove a bookmark by URL
	 */
	remove(url: string): void {
		const index = this.bookmarks.findIndex(b => b.url === url);
		if (index !== -1) {
			const removed = this.bookmarks.splice(index, 1)[0];
			this.save();
			this.notificationService.notify({
				severity: Severity.Info,
				message: `Removed bookmark: ${removed.title}`,
				sticky: false
			});
		}
	}

	/**
	 * Check if a URL is bookmarked
	 */
	isBookmarked(url: string): boolean {
		return this.bookmarks.some(b => b.url === url);
	}

	/**
	 * Get all bookmarks
	 */
	getAll(): BrowserBookmark[] {
		return [...this.bookmarks];
	}
}
