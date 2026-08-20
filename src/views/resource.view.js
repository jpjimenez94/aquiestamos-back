/**
 * VISTA: Resource
 */
export function resourcePublic(resource) {
  return {
    slug: resource.slug,
    title: resource.title,
    description: resource.description,
    collection: resource.collection,
    coverImage: resource.coverImage,
    fileUrl: resource.fileUrl,
    fileName: resource.fileName,
    icon: resource.icon,
    category: resource.category
      ? { slug: resource.category.slug, name: resource.category.name }
      : undefined,
  }
}

export function resourceGroups(categories) {
  return categories
    .filter((category) => category.resources.length > 0)
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      resources: category.resources.map(resourcePublic),
    }))
}
