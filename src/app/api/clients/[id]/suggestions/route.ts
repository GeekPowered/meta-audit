import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TITLE_MIN, TITLE_MAX, DESCRIPTION_MIN, DESCRIPTION_MAX, lengthMeta } from "@/lib/seoLimits";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const suggestions = await prisma.suggestion.findMany({
    where: { page: { clientId: id } },
    include: {
      page: { select: { url: true, currentTitle: true, currentDescription: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const withLengths = suggestions.map((suggestion) => {
    const suggestedTitle = lengthMeta(suggestion.suggestedTitle, TITLE_MIN, TITLE_MAX);
    const suggestedDescription = lengthMeta(suggestion.suggestedDescription, DESCRIPTION_MIN, DESCRIPTION_MAX);
    const editedTitle = lengthMeta(suggestion.editedTitle, TITLE_MIN, TITLE_MAX);
    const editedDescription = lengthMeta(suggestion.editedDescription, DESCRIPTION_MIN, DESCRIPTION_MAX);

    return {
      ...suggestion,
      suggestedTitleLength: suggestedTitle.length,
      suggestedTitleInRange: suggestedTitle.inRange,
      suggestedDescriptionLength: suggestedDescription.length,
      suggestedDescriptionInRange: suggestedDescription.inRange,
      editedTitleLength: suggestion.editedTitle == null ? null : editedTitle.length,
      editedTitleInRange: suggestion.editedTitle == null ? null : editedTitle.inRange,
      editedDescriptionLength: suggestion.editedDescription == null ? null : editedDescription.length,
      editedDescriptionInRange: suggestion.editedDescription == null ? null : editedDescription.inRange,
    };
  });

  return NextResponse.json(withLengths);
}
