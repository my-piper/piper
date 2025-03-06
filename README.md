Piper - visual pipelines builder fo AI.

# Development

Pull latest sub-modules

```bash
git submodule update --init --recursive
```

Run services

```bash
make up
```

Copy `~/backend/.env.template` to `~/backend/.env`

```bash
cp ~/backend/.env.template ~/backend/.env
```

Compile schemas

```bash
make schemas
```

Add admin user

```bash
npm --prefix backend run cli add-user -- --id admin --name admin --role admin --password xyzXYZ
```

# Debug

## Read Kafka stream

```bash
kafka-console-consumer --bootstrap-server localhost:9094 --topic pipeline.messages --from-beginning
```

## Development

Install dependencies:

```bash
make back_ci
make front_ci
```

Run backend & frontend (in separate terminals):

```bash
make back_start
make back_worker
make back_sockets
make front_start
```

## Cookbook

```sh
ffmpeg -i x2_raw.mp4 -vf "crop=in_h*9/16:in_h:(in_w-in_h*9/16)/2:0,eq=brightness=0.05:contrast=1.5" -vcodec libx264  -crf 10 x2.mp4

ffmpeg -i x3_raw.mov -vf "scale=-1:1024" -vcodec libx264  -crf 25 x3.mp4

ffmpeg -i x5_raw.mp4 -vcodec libx264 -crf 25 x5.mp4

ffmpeg -i x6_raw.mp4 -vcodec libx264 x6.mp4

ffmpeg -i x4_raw.mp4  -vf "noise=c0s=20:c0f=t+u,split[original][copy];[copy]reverse[reversed];[original][reversed]concat" -vcodec libx264 -crf 25 x4.mp4
-filter_complex "[0:v][1:v] overlay=x=(main_w-overlay_w):y=(main_h-overlay_h),drawtext=text=string1:y=line_h-10:x='if(gte(t,30),w-(t-30)*w/20,w)'"


ffmpeg -r 22 -i ../tmp/7e01e398bc/%05d.png -loop 1 -i ../tmp/7e01e398bc/logo.png -filter_complex "overlay=y='if(gte(t,0), ((H+h)\/5)\*mod(t\,5)-h, NAN)':x='if(gte(t,0), ((H+h)\/5)\*mod(t\,5)-h, NAN)':shortest=1,noise=c0s=20:c0f=t+u,split[original][copy];[copy]reverse[reversed];[original][reversed]concat" -vcodec libx264 -crf 25 ../tmp/7e01e398bc/output.mp4
```

ffmpeg -r 1 -i %05d.png -vf "drawtext=text='Place text here':x=10:y=H-th-10:fontsize=120:fontcolor=white:shadowcolor=black:shadowx=5:shadowy=5" -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -movflags +faststart -crf 28 -b:v 500k output.mp4

ffmpeg -r 1 -i %05d.png -vf "fps=24,unsharp=7:7:3.0:7:7:1.5,split[original][copy];[copy]reverse[reversed];[original][reversed]concat,drawtext=text='FAKE':fontcolor=white@0.25:fontsize=150:fontfile=/Users/anton/projects/gc/piper/fullstack/tmp/1fe9632d22/watermark.ttf:x=if(eq(mod(n\,24)\,0)\,sin(random(1))*w\,x):y=if(eq(mod(n\,24)\,0)\,sin(random(1))*h\,y),drawtext=text='Only for internal using. Do NOT distribute. Do NOT remove this disclaimer.':box=1:boxcolor=black@0.5:boxborderw=25:fontcolor=white:fontfile=/Users/anton/projects/gc/piper/fullstack/tmp/1fe9632d22/watermark.ttf:fontsize=80:x='w-t*(w*2+tw)/10':y=h-line_h-10" -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -movflags +faststart -crf 28 -b:v 500k output.mp4

ffmpeg -i input_video.mp4 -vf "unsharp=5:5:1.0:5:5:0.0" output_video.mp4

ffmpeg -i x6_raw.mp4 -vf "unsharp=7:7:5.0:7:7:2.5" -vcodec libx264 x6.mp4

# How to

