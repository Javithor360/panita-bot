import { env } from '../../config/env';
import { createCloudinary } from '../../lib/cloudinary';
import { createQuickUpload } from './flow';

export type { PostLike, ReactedMessage } from './flow';

/** The quick upload of this process, configured from the environment. It is off without `GALLERY_CHANNEL_ID`. */
export const quickUpload = createQuickUpload({
  channelId: env.GALLERY_CHANNEL_ID,
  cloudinary: env.CLOUDINARY ? createCloudinary(env.CLOUDINARY) : undefined,
});
