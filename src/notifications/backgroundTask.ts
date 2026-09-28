// Must be imported from the app entry (index.ts) so the task is defined before
// iOS/Android launch the JS bundle headlessly for a content-available push.
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { BG_PUSH_TASK, handleBackgroundTask } from './handler';

TaskManager.defineTask(BG_PUSH_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[bgTask] Background notification task error:', error);
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
  return handleBackgroundTask(data);
});

Notifications.registerTaskAsync(BG_PUSH_TASK).catch((err) => {
  console.error('[bgTask] registerTaskAsync failed:', err);
});
