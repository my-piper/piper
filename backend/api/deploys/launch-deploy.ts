/*api.post(
    "/api/:slug/launch",
    handle(() => async ({ params: { slug }, body, ip }) => {
      const {
        project,
        pipeline,
        launchRequest: deployLaunchRequest,
        scope,
      } = await deploying.get(slug);
  
      const { parent, comment } = body;
  
      const launchRequest = plainToInstance(
        LaunchRequest,
        merge(instanceToPlain(deployLaunchRequest), body)
      );
  
      const { _id, url } = await run({
        pipeline,
        launchRequest,
        scope,
        project,
        parent,
        comment: comment || `API call from ${ip}`,
      });
      return instanceToPlain(new Launch({ _id, url }));
    })
  );*/
