export const UI_DELAY = 250;

export const UI = {
  // Node geometry, mirrored by the --node-* tokens in styles/themes.scss.
  // A port's centre sits (index + 1) * input.height + shift below the node's
  // top: 1px border, 26px title bar, 4px padding, then 22px rows.
  node: {
    width: 220,
    title: 26,
    padding: 4,
    shift: 20,
    input: {
      height: 22,
    },
  },
  input: {
    width: 32,
    height: 32,
    shift: 8,
  },
  output: {
    width: 15,
    shift: 8,
  },
};
