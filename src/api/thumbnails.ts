import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import {getVideo, updateVideo, type Video} from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import {BadRequestError, NotFoundError, UserForbiddenError} from "./errors";
import * as path from "node:path";
import {getAssetDiskPath, getMediaExt} from "./assets.ts";
import {randomBytes} from "crypto";


export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();
  const file = formData.get("thumbnail");
  if(!(file instanceof File)) {
    throw new BadRequestError("Invalid file");
  }
  const MAX_UPLOAD_SIZE = 1024 * 1024 * 10;
  if(file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("File too large");
  }
  const mediaType = getMediaExt(file.type);
  const video = getVideo(cfg.db, videoId);
  const randomFilePath = randomBytes(32).toString("base64url");
  const filepath = `${randomFilePath}${mediaType}`
  const urlpath:string = getAssetDiskPath(cfg, filepath);
  if(userID !== video?.userID) {
    throw new UserForbiddenError("Not authorized to upload this thumbnail");
  }
  await Bun.write(urlpath, file);
  video.thumbnailURL = `http://localhost:${cfg.port}/${urlpath}`;
  updateVideo(cfg.db,video);


  return respondWithJSON(200, video);
}
