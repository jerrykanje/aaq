 import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const FIVE_HOURS_IN_MS = 5 * 60 * 60 * 1000;

export function usePreventBack(isActiveRide: boolean) {
  const navigate = useNavigate();
  const lockTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rideLockStartTime = useRef<number | null>(null);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (isActiveRide) {
        const currentTime = Date.now();
        const lockStartTime = rideLockStartTime.current;

        if (lockStartTime && (currentTime - lockStartTime) >= FIVE_HOURS_IN_MS) {
          localStorage.removeItem('rideLockTimestamp');
          rideLockStartTime.current = null;
          navigate('/', { replace: true });
          return;
        }

        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
      }
    };

    if (isActiveRide) {
      const storedLockTime = localStorage.getItem('rideLockTimestamp');
      const currentTime = Date.now();

      if (storedLockTime) {
        const lockTime = parseInt(storedLockTime, 10);
        const elapsedTime = currentTime - lockTime;

        if (elapsedTime >= FIVE_HOURS_IN_MS) {
          localStorage.removeItem('rideLockTimestamp');
          navigate('/', { replace: true });
          return;
        }

        rideLockStartTime.current = lockTime;
        const remainingTime = FIVE_HOURS_IN_MS - elapsedTime;

        lockTimeoutRef.current = setTimeout(() => {
          localStorage.removeItem('rideLockTimestamp');
          rideLockStartTime.current = null;
          navigate('/', { replace: true });
        }, remainingTime);
      } else {
        rideLockStartTime.current = currentTime;
        localStorage.setItem('rideLockTimestamp', currentTime.toString());

        lockTimeoutRef.current = setTimeout(() => {
          localStorage.removeItem('rideLockTimestamp');
          rideLockStartTime.current = null;
          navigate('/', { replace: true });
        }, FIVE_HOURS_IN_MS);
      }

      window.history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', handlePopState);
    } else {
      localStorage.removeItem('rideLockTimestamp');
      rideLockStartTime.current = null;
      if (lockTimeoutRef.current) {
        clearTimeout(lockTimeoutRef.current);
        lockTimeoutRef.current = null;
      }
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (lockTimeoutRef.current) {
        clearTimeout(lockTimeoutRef.current);
      }
    };
  }, [isActiveRide, navigate]);
}