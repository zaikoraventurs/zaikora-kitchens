import { useEffect } from 'react';
import {
  neutralizeElement,
  shouldBlockExternalElement,
  sweepInjectedWatermarks,
} from '../lib/watermarkShield';

/**
 * Invisible DOM & Injection Watermark Shield.
 * Silently removes unauthorized third-party watermarks, "Powered by Deploy" / hosting drawers,
 * and unapproved external scripts/iframes injected outside #root.
 * Renders null so nothing appears on screen.
 */
export function WatermarkShield() {
  useEffect(() => {
    // Initial sweep immediately on mount
    sweepInjectedWatermarks(document);

    const appRoot = document.getElementById('root');
    let pendingSweep = false;

    const scheduleSweep = () => {
      if (pendingSweep) return;
      pendingSweep = true;
      queueMicrotask(() => {
        pendingSweep = false;
        sweepInjectedWatermarks(document);
      });
    };

    const observer = new MutationObserver((mutations) => {
      let needsFullSweep = false;

      for (const mutation of mutations) {
        // Ignore legitimate React mutations inside #root
        if (appRoot && appRoot.contains(mutation.target) && mutation.target !== document.body && mutation.target !== document.documentElement) {
          continue;
        }

        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            if (appRoot && (node === appRoot || appRoot.contains(node))) return;

            if (shouldBlockExternalElement(node)) {
              neutralizeElement(node);
            } else {
              needsFullSweep = true;
            }
          });
        } else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          const target = mutation.target;
          if (appRoot && (target === appRoot || appRoot.contains(target))) continue;
          if (shouldBlockExternalElement(target)) {
            neutralizeElement(target);
          }
        }
      }

      if (needsFullSweep) {
        scheduleSweep();
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'href', 'class', 'id', 'style', 'data-netlify-deploy-id', 'data-powered-by'],
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sweepInjectedWatermarks(document);
      }
    };

    // Lightweight periodic integrity pass only while tab is visible (catches delayed shadow/script mounts)
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        sweepInjectedWatermarks(document);
      }
    }, 3000);

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      observer.disconnect();
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
