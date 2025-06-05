import { respondWithJSON } from "./json";
import { type ApiConfig } from "../config";
import {type BunRequest, S3Client} from "bun";
import {BadRequestError, UserForbiddenError} from "./errors.ts";
import {getBearerToken, validateJWT} from "../auth.ts";
import {getVideo, updateVideo} from "../db/videos.ts";
import {
  dbVideoToSignedVideo,
  getBucketURL,
  getMediaExt,
  getVideoAspectRatio,
  processVideoForFastStart
} from "./assets.ts";
import {randomBytes} from "crypto";
import {rm} from "fs/promises"

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const {videoId} = req.params as { videoId?: string };
  if(!videoId) {
    throw new BadRequestError("Invalid video ID");
  }
  const token = getBearerToken(req.headers);
  const userID = validateJWT(token,cfg.jwtSecret);
  const video = getVideo(cfg.db, videoId);
  if(userID !== video?.userID) {
    throw new UserForbiddenError("Not authorized to upload this video to this account");
  }
  const formData = await req.formData();
  const file = formData.get("video");
  const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024;
  if(!(file instanceof File)){
    throw new BadRequestError("Invalid file type");
  }
  if(file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Invalid file size");
  }
  if(file.type !== "video/mp4"){
    throw new BadRequestError("Invalid media type");
  }
  const tmpPath = `/tmp/${videoId}.mp4`;
  await Bun.write(tmpPath,file);


  const newPath = await processVideoForFastStart(tmpPath);
  const aspectRatio = await getVideoAspectRatio(newPath);
  const filepath = `${aspectRatio}/${videoId}.mp4`;
  const s3file = cfg.s3Client.file(filepath, {bucket : cfg.s3Bucket});
  const videoFile = Bun.file(newPath);
  await s3file.write(videoFile, {type: "video/mp4"});
  video.videoURL = `${filepath}`;
  updateVideo(cfg.db, video);
  const updatedVideo = await dbVideoToSignedVideo(cfg,video);

  await Promise.all(
      [
          rm(tmpPath, {force: true}),
          rm(newPath, {force: true})
      ]
  );


  return respondWithJSON(200, updatedVideo);
}
