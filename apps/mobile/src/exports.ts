/**
 * The journal export's file, and getting rid of it.
 *
 * `Settings` writes the whole journal — every entry, in plaintext — to the
 * app's cache and hands it to the system share sheet, because that is what a
 * phone has instead of a download. It cannot delete the file straight
 * afterwards: the share sheet may still be reading it when `shareAsync`
 * returns.
 *
 * So it was left for the system to clear, which the system does eventually and
 * on no schedule anybody can state. That meant a plaintext copy of the most
 * personal text the product holds could sit in the app's container for weeks,
 * and be picked up by a device backup, long after the person had finished
 * sharing it.
 *
 * Deleting it at the next launch is the bound that is actually available: by
 * then any share has finished, and the exposure is one app session rather than
 * one unspecified operating-system decision. It is not encryption and it is
 * not a guarantee — a backup taken between the share and the next launch has
 * it — but "until you next open the app" is a sentence that can be said.
 */
import { File, Paths } from 'expo-file-system';

/** One file, overwritten, so there is never more than this to clean up. */
export const EXPORT_FILE = 'stillpoint-data.json';

/** The cache file an export writes, or null where there is no filesystem. */
export function exportFile(): File | null {
  try {
    return new File(Paths.cache, EXPORT_FILE);
  } catch {
    // The web preview has no `Paths.cache`. Export is a phone feature and the
    // screen already reports that it cannot run there.
    return null;
  }
}

/**
 * Removes a previous export, if one is there.
 *
 * Called at startup rather than after sharing, and never allowed to fail
 * loudly: a leftover file is a privacy cost, and failing to delete it is not a
 * reason to refuse to start the app for somebody who is upset.
 */
export function discardPreviousExport(): void {
  try {
    const file = exportFile();
    if (file?.exists) file.delete();
  } catch {
    // Nothing to do about it, and nothing worth saying to the user.
  }
}
