// SVG files load as text (angular.json `loader`), e.g. for `src/icons`.
declare module "*.svg" {
  const svg: string;
  export default svg;
}
