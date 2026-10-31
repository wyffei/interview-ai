import {
  desktopCapturer,
  screen,
  type DesktopCapturerSource,
  type Display,
  type NativeImage
} from 'electron'
import { regionToPixels, type RegionRect } from '../shared/capture-region'
import { settings } from './settings'

/**
 * Windows settings show physical pixels, macOS the "looks like" size, which is
 * the DIP size: a 4K panel at 2x is listed as 2560×1440, not 5120×2880.
 */
export function settingsResolution(display: Display): Electron.Size {
  const scale = process.platform === 'darwin' ? 1 : display.scaleFactor
  return {
    width: Math.round(display.size.width * scale),
    height: Math.round(display.size.height * scale)
  }
}

/**
 * The capture source of a screen. Sources come in no particular order, so
 * `sources[0]` is not the primary screen; `display_id` matches `Display.id`
 * on macOS and Windows.
 */
export function findScreenSource(
  sources: DesktopCapturerSource[],
  display: Display
): DesktopCapturerSource | undefined {
  return sources.find((s) => s.display_id === String(display.id))
}

/**
 * Capture every screen, `displays` being the ones the caller needs. The first
 * capture after launch now and then comes back empty for one screen (seen on
 * macOS with an external one) while the next is fine, so a needed screen that
 * comes back empty is captured once more.
 */
export async function captureScreens(
  thumbnailSize: Electron.Size,
  displays: Display[]
): Promise<DesktopCapturerSource[]> {
  const capture = (): Promise<DesktopCapturerSource[]> =>
    desktopCapturer.getSources({ types: ['screen'], thumbnailSize })
  const sources = await capture()
  const hasEmpty = displays.some((d) => findScreenSource(sources, d)?.thumbnail.isEmpty())
  return hasEmpty ? capture() : sources
}

/**
 * What to capture. A region pins the capture to its own screen; otherwise it
 * is the screen under the cursor. A region whose screen is no longer connected
 * is passed over, and kept for when it is plugged back in.
 */
function getCaptureTarget(): { display: Display; region: RegionRect | null } {
  const region = settings.captureRegion
  const regionDisplay =
    region && screen.getAllDisplays().find((d) => String(d.id) === region.displayId)
  if (regionDisplay) return { display: regionDisplay, region }
  return { display: screen.getDisplayNearestPoint(screen.getCursorScreenPoint()), region: null }
}

/** The screen (or the capture region on it) as base64 PNG; nothing if the capture failed */
export function takeScreenshot(): Promise<string | void> {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve()

  const { display, region } = getCaptureTarget()
  const { width, height } = display.size

  return captureScreens({ width, height }, [display])
    .then((sources) => {
      if (sources.length === 0) return undefined
      const { thumbnail } = findScreenSource(sources, display) ?? sources[0]
      const image = region ? thumbnail.crop(regionToPixels(region, thumbnail.getSize())) : thumbnail
      return image.toPNG().toString('base64')
    })
    .catch((error) => {
      console.error('Error taking screenshot:', error)
    })
}

/**
 * An area of a capture of `display`, taken at whatever resolution, as the
 * screenshot takeScreenshot() would make of it: sized in DIPs, not physical
 * pixels, so it costs the model what the same area of a full capture would.
 */
export function cropScreenshot(capture: NativeImage, display: Display, area: RegionRect): string {
  const { width, height } = regionToPixels(area, display.size)
  return capture
    .crop(regionToPixels(area, capture.getSize()))
    .resize({ width, height, quality: 'best' })
    .toPNG()
    .toString('base64')
}
