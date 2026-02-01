/**
 * Pushover notification service for sending push notifications
 * https://pushover.net/api
 */

const PUSHOVER_API_URL = 'https://api.pushover.net/1/messages.json';
const PUSHOVER_USER_KEY = process.env.PUSHOVER_USER_KEY || '';
const PUSHOVER_APP_TOKEN = process.env.PUSHOVER_APP_TOKEN || '';

export type PushoverPriority = -2 | -1 | 0 | 1 | 2;

export interface PushoverOptions {
  priority?: PushoverPriority;
  sound?: string;
  url?: string;
  urlTitle?: string;
}

export interface PushoverResponse {
  status: number;
  request: string;
  errors?: string[];
}

/**
 * Check if Pushover is configured with required credentials
 */
export const isPushoverConfigured = (): boolean => {
  return !!(PUSHOVER_USER_KEY && PUSHOVER_APP_TOKEN);
};

/**
 * Send a push notification via Pushover
 * @param title - Notification title
 * @param message - Notification message body
 * @param options - Optional settings (priority, sound, url)
 * @returns Promise resolving to the Pushover API response
 */
export const sendNotification = async (
  title: string,
  message: string,
  options: PushoverOptions = {}
): Promise<PushoverResponse> => {
  if (!isPushoverConfigured()) {
    console.warn('Pushover not configured - skipping notification');
    return { status: 0, request: 'not_configured' };
  }

  const body = new URLSearchParams({
    token: PUSHOVER_APP_TOKEN,
    user: PUSHOVER_USER_KEY,
    title,
    message,
    ...(options.priority !== undefined && { priority: String(options.priority) }),
    ...(options.sound && { sound: options.sound }),
    ...(options.url && { url: options.url }),
    ...(options.urlTitle && { url_title: options.urlTitle }),
  });

  try {
    const response = await fetch(PUSHOVER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json() as PushoverResponse;

    if (data.status !== 1) {
      console.error('Pushover notification failed:', data.errors);
    } else {
      console.log(`Pushover notification sent: "${title}"`);
    }

    return data;
  } catch (error) {
    console.error('Pushover API error:', error);
    throw error;
  }
};

/**
 * Send a high-priority balance alert notification
 * @param accountName - Name of the account (e.g., "Chase Sapphire")
 * @param currentBalance - Current balance amount
 * @param threshold - The threshold that was exceeded
 */
export const sendBalanceAlert = async (
  accountName: string,
  currentBalance: number,
  threshold: number
): Promise<PushoverResponse> => {
  const formattedBalance = currentBalance.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  const formattedThreshold = threshold.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  return sendNotification(
    `💳 High Balance Alert: ${accountName}`,
    `Your ${accountName} balance is ${formattedBalance}, which exceeds your ${formattedThreshold} threshold. Consider making a payment.`,
    { priority: 1 } // High priority (shows as red on iOS)
  );
};
