import { useLayoutEffect } from 'react';
import { NavigationType, useLocation, useNavigationType } from 'react-router-dom';

function resetScrollTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export function ScrollToTop() {
  const { pathname, hash, key } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
        return;
      }
    }

    if (navigationType !== NavigationType.Replace) {
      resetScrollTop();
    }
  }, [pathname, hash, key, navigationType]);

  return null;
}
