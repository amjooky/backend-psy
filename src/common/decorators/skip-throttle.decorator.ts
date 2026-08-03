import { SetMetadata } from '@nestjs/common';

export const SKIP_THROTTLE_KEY = 'skipThrottle';

/**
 * Skips rate limiting for a specific route.
 * Usage: @SkipThrottle()
 */
export const SkipThrottle = () => SetMetadata(SKIP_THROTTLE_KEY, true);
