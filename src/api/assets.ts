import { existsSync, mkdirSync } from "fs";

import type { ApiConfig } from "../config";
import * as path from "node:path";
import {S3Client} from "bun";
import type {Video} from "../db/videos.ts";

export function ensureAssetsDir(cfg: ApiConfig) {
  if (!existsSync(cfg.assetsRoot)) {
    mkdirSync(cfg.assetsRoot, { recursive: true });
  }
}

export function getMediaExt(mediaType: string) {
  const parts = mediaType.split("/");
  if(parts.length !== 2) {
    return ".bin";
  }
  return "." + parts[1];
}
export function getAssetDiskPath(cfg: ApiConfig, assetPath:string):string {
  return path.join(cfg.assetsRoot, assetPath);
}
export function getAssetURL(cfg: ApiConfig, assetPath: string):string{
  return `http://localhost:${cfg.port}/${assetPath}`;
}

export function getBucketURL(cfg: ApiConfig, key: string):string {
  return `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${key}`;
}


export async function getVideoAspectRatio(filePath: string) {
  const proc = Bun.spawn(
      ["ffprobe", "-v","error","-select_streams", "v:0", "-show_entries", "stream=width,height", "-of","json", filePath]);
  const stdout:string = await new Response(proc.stdout).text();
  const stderr:string = await new Response(proc.stderr).text();

  if(await proc.exited !== 0){
    throw new Error(stderr);
  }
  const data = await JSON.parse(stdout);
  if(!data.streams) {
    throw new Error("No streams found");
  }
  const dataWidth:number = data.streams[0].width;
  const dataHeight:number = data.streams[0].height;

  return dataWidth === Math.floor(16 * (dataHeight / 9))
  ? "landscape"
      :dataHeight === Math.floor(16 * (dataWidth / 9))
  ? "portrait"
          : "other";

}


export async function processVideoForFastStart(inputFilePath: any) {

  const outputPath = inputFilePath + ".processed.mp4"
  const proc = Bun.spawn(["ffmpeg", "-i", inputFilePath, "-movflags", "faststart", "-map_metadata", "0" , "-codec", "copy", "-f" , "mp4", outputPath]);
  if(await proc.exited !== 0) {
    throw new Error("Failed to process video");
  }
  return outputPath;

}

export async function generatePresignedURL(cfg: ApiConfig, key: string, expireTime: number) {
  return cfg.s3Client.presign(`${key}`, {expiresIn: expireTime})
}

export async function dbVideoToSignedVideo(cfg: ApiConfig, video: Video) {
  if(!video.videoURL) {
    return video;
  }
  video.videoURL = await generatePresignedURL(cfg,video.videoURL,5*60);
  return video;
}