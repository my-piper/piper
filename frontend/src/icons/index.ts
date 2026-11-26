/**
 * Piper's own icon set, registered with Taiga's `tuiIconsProvider` and drawn
 * by `tui-icon` (or a Taiga button's `iconStart`) as a mask in `currentColor`.
 * Keys are the names pipelines use (`icon` of an input in
 * backend/schemas/pipeline.json), so none may be renamed or dropped.
 * `@img.` keys are multicolor and drawn as images. `-bold` variants are
 * drawn with a stroke of 2 instead of 1.
 */
import icon3dModelingSvg from "./3d_modeling.svg";
import addSvg from "./add.svg";
import addCircleSvg from "./add-circle.svg";
import addNodeSvg from "./add-node.svg";
import adminSvg from "./admin.svg";
import agentSvg from "./agent.svg";
import appSvg from "./app.svg";
import archiveSvg from "./archive.svg";
import assistantSvg from "./assistant.svg";
import audioSvg from "./audio.svg";
import checkedSvg from "./checked.svg";
import chevronDownSvg from "./chevron-down.svg";
import chevronLeftSvg from "./chevron-left.svg";
import chevronRightSvg from "./chevron-right.svg";
import chevronUpSvg from "./chevron-up.svg";
import closeSvg from "./close.svg";
import cloudSvg from "./cloud.svg";
import codeGenerationSvg from "./code_generation.svg";
import copySvg from "./copy.svg";
import cursorSvg from "./cursor.svg";
import deepSwapSvg from "./deep_swap.svg";
import deleteSvg from "./delete.svg";
import dollarSvg from "./dollar.svg";
import downloadSvg from "./download.svg";
import dragSvg from "./drag.svg";
import editSvg from "./edit.svg";
import errorSvg from "./error.svg";
import faceSvg from "./face.svg";
import faceSwappingSvg from "./face_swapping.svg";
import googleSvg from "./google.svg";
import gridSvg from "./grid.svg";
import helpSvg from "./help.svg";
import imageSvg from "./image.svg";
import imageEditingSvg from "./image_editing.svg";
import imageGenerationSvg from "./image_generation.svg";
import inSvg from "./in.svg";
import infoSvg from "./info.svg";
import inputSvg from "./input.svg";
import jsonSvg from "./json.svg";
import jsonTextSvg from "./json_text.svg";
import languageTranslationSvg from "./language_translation.svg";
import lockSvg from "./lock.svg";
import logoutSvg from "./logout.svg";
import magicSvg from "./magic.svg";
import menuSvg from "./menu.svg";
import minusSvg from "./minus.svg";
import moreSvg from "./more.svg";
import moreBoldSvg from "./more-bold.svg";
import nodeSvg from "./node.svg";
import numberSvg from "./number.svg";
import objectDetectionSvg from "./object_detection.svg";
import offSvg from "./off.svg";
import onSvg from "./on.svg";
import openLinkSvg from "./open-link.svg";
import openLinkBoldSvg from "./open-link-bold.svg";
import outSvg from "./out.svg";
import passwordSvg from "./password.svg";
import playSvg from "./play.svg";
import playFilledSvg from "./play-filled.svg";
import plusSvg from "./plus.svg";
import removeSvg from "./remove.svg";
import saveSvg from "./save.svg";
import selectImageSvg from "./select-image.svg";
import shareSvg from "./share.svg";
import speechSynthesisSvg from "./speech_synthesis.svg";
import stopSvg from "./stop.svg";
import switcherSvg from "./switcher.svg";
import textSvg from "./text.svg";
import textAnalysisSvg from "./text_analysis.svg";
import textGenerationSvg from "./text_generation.svg";
import themeSvg from "./theme.svg";
import uncheckedSvg from "./unchecked.svg";
import uploadSvg from "./upload.svg";
import userSvg from "./user.svg";
import validateSvg from "./validate.svg";
import videoSvg from "./video.svg";
import videoGenerationSvg from "./video_generation.svg";
import yandexSvg from "./yandex.svg";

export const PIPER_ICONS: Record<string, string> = {
  "3d_modeling": icon3dModelingSvg,
  add: addSvg,
  "add-circle": addCircleSvg,
  "add-node": addNodeSvg,
  admin: adminSvg,
  agent: agentSvg,
  app: appSvg,
  archive: archiveSvg,
  assistant: assistantSvg,
  audio: audioSvg,
  checked: checkedSvg,
  "chevron-down": chevronDownSvg,
  "chevron-left": chevronLeftSvg,
  "chevron-right": chevronRightSvg,
  "chevron-up": chevronUpSvg,
  close: closeSvg,
  cloud: cloudSvg,
  code_generation: codeGenerationSvg,
  copy: copySvg,
  cursor: cursorSvg,
  deep_swap: deepSwapSvg,
  delete: deleteSvg,
  dollar: dollarSvg,
  download: downloadSvg,
  drag: dragSvg,
  edit: editSvg,
  error: errorSvg,
  face: faceSvg,
  face_swapping: faceSwappingSvg,
  "@img.google": googleSvg,
  grid: gridSvg,
  help: helpSvg,
  image: imageSvg,
  image_editing: imageEditingSvg,
  image_generation: imageGenerationSvg,
  in: inSvg,
  info: infoSvg,
  input: inputSvg,
  json: jsonSvg,
  json_text: jsonTextSvg,
  language_translation: languageTranslationSvg,
  lock: lockSvg,
  logout: logoutSvg,
  magic: magicSvg,
  menu: menuSvg,
  minus: minusSvg,
  more: moreSvg,
  "more-bold": moreBoldSvg,
  node: nodeSvg,
  number: numberSvg,
  object_detection: objectDetectionSvg,
  off: offSvg,
  on: onSvg,
  "open-link": openLinkSvg,
  "open-link-bold": openLinkBoldSvg,
  out: outSvg,
  password: passwordSvg,
  play: playSvg,
  "play-filled": playFilledSvg,
  plus: plusSvg,
  remove: removeSvg,
  save: saveSvg,
  "select-image": selectImageSvg,
  share: shareSvg,
  speech_synthesis: speechSynthesisSvg,
  stop: stopSvg,
  switcher: switcherSvg,
  text: textSvg,
  text_analysis: textAnalysisSvg,
  text_generation: textGenerationSvg,
  theme: themeSvg,
  unchecked: uncheckedSvg,
  upload: uploadSvg,
  user: userSvg,
  validate: validateSvg,
  video: videoSvg,
  video_generation: videoGenerationSvg,
  "@img.yandex": yandexSvg,
};
