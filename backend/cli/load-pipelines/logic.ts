import { plainToInstance } from "class-transformer";
import { toPlain } from "core-kit/utils/models";
import { constants } from "fs";
import { access, readFile } from "fs/promises";
import assign from "lodash/assign";
import merge from "lodash/merge";
import path from "path";
import * as YAML from "yaml";
import mongo from "../../app/mongo";
import { LaunchRequest } from "../../models/launch-request";
import { Pipeline } from "../../models/pipeline";
import { Project } from "../../models/project";
import { User } from "../../models/user";
import { sid } from "../../utils/string";

const PIPELINES_FOLDER = "./pipelines";

async function loadPipeline(id: string): Promise<Pipeline> {
  const yaml = await readFile(
    path.join(PIPELINES_FOLDER, `${id}.yaml`),
    "utf-8"
  );
  return plainToInstance(Pipeline, YAML.parse(yaml));
}

async function loadLaunchRequest(id: string): Promise<Object> {
  const filePath = path.join(PIPELINES_FOLDER, `${id}.json`);
  try {
    await access(filePath, constants.F_OK);
  } catch (e) {
    return {};
  }
  const json = await readFile(filePath, "utf-8");
  return JSON.parse(json);
}

const PROJECTS = [
  new Project({
    _id: "generate-image",
    title: "🖼️ Generate image",
  }),
  new Project({
    _id: "image-to-image",
    title: "🏞️ Image to image",
  }),
  new Project({
    _id: "inpaint-on-image",
    title: "🌠 Inpaint on image",
  }),
  new Project({
    _id: "translate-text",
    title: "🇺🇸 Translate text",
  }),
  new Project({
    _id: "remove-background",
    title: "🧩 Remove background",
  }),
  new Project({
    _id: "face-swap-on-image",
    title: "🧑‍🚀 Face swap on image",
  }),
  new Project({
    _id: "auto-detailer-on-image",
    title: "🛠️ Auto detailer on image",
  }),
  new Project({
    _id: "generate-pika-video",
    title: "🎬 Generate Pika video",
  }),
  new Project({
    _id: "describe-person-on-image",
    title: "🙋 Describe person on image",
  }),
  new Project({
    _id: "dress-up-on-image",
    title: "👗 Dress up on image",
  }),
  new Project({
    _id: "upscale-image",
    title: "📐 Upscale image",
  }),
  new Project({
    _id: "write-post-seo",
    title: "📝 Write post SEO",
  }),
  new Project({
    _id: "face-to-image",
    title: "🪪 Face to image",
  }),
  new Project({
    _id: "compress-video",
    title: "📹 Compress video",
  }),
];

export async function loadPipelines() {
  for (const project of PROJECTS) {
    const { _id, title } = project;
    console.log(`Load project ${title}`);

    const { launchRequest } = (await mongo.projects.findOne<{
      launchRequest: Object;
    }>({ _id }, { projection: { launchRequest: 1 } })) || {
      launchRequest: {
        nodes: {},
        inputs: {},
      },
    };

    assign(project, {
      createdAt: new Date(),
      createdBy: new User({ _id: "admin" }),
      revision: sid(),
      pipeline: await loadPipeline(_id),
      launchRequest: plainToInstance(
        LaunchRequest,
        merge(await loadLaunchRequest(_id), launchRequest)
      ),
    });
    await mongo.projects.updateOne(
      { _id },
      { $set: toPlain(project) },
      { upsert: true }
    );
  }

  console.log("Done 😮");
}
