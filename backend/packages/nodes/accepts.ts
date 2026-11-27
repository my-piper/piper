/**
 * A `$expr` matching a node whose `inputs` map has an input of one of
 * `types`: the catalog filter behind "accepts <type>" in node search.
 */
export function hasInputOf(types: string[]) {
  return {
    $gt: [
      {
        $size: {
          $filter: {
            input: { $objectToArray: { $ifNull: ["$inputs", {}] } },
            cond: { $in: ["$$this.v.type", types] },
          },
        },
      },
      0,
    ],
  };
}
