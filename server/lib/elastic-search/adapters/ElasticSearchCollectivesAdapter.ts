import models, { Op } from '../../../models';
import { stripHTMLOrEmpty } from '../../sanitize-html';
import { ElasticSearchIndexName } from '../constants';

import { ElasticSearchModelAdapter, FindEntriesToIndexOptions } from './ElasticSearchModelAdapter';

export class ElasticSearchCollectivesAdapter implements ElasticSearchModelAdapter {
  public readonly index = ElasticSearchIndexName.COLLECTIVES;
  public readonly mappings = {
    properties: {
      id: { type: 'keyword' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
      slug: { type: 'keyword' },
      name: { type: 'text' },
      type: { type: 'keyword' },
      legalName: { type: 'text' },
      countryISO: { type: 'keyword' },
      description: { type: 'text' },
      longDescription: { type: 'text' },
      website: { type: 'keyword' },
      isActive: { type: 'boolean' },
      isHostAccount: { type: 'boolean' },
      deactivatedAt: { type: 'date' },
      tags: { type: 'keyword' },
      // Relationships
      HostCollectiveId: { type: 'keyword' },
      ParentCollectiveId: { type: 'keyword' },
    },
  } as const;

  public getModel() {
    return models.Collective;
  }

  public async findEntriesToIndex(options: FindEntriesToIndexOptions = {}) {
    return models.Collective.findAll({
      attributes: Object.keys(this.mappings.properties),
      order: [['id', 'DESC']],
      limit: options.limit,
      offset: options.offset,
      raw: true,
      where: {
        ...(options.fromDate ? { updatedAt: options.fromDate } : null),
        ...(options.maxId ? { id: { [Op.lte]: options.maxId } } : null),
        ...(options.ids?.length ? { id: options.ids } : null),
        ...(options.relatedToCollectiveIds?.length
          ? {
              [Op.or]: [
                { id: options.relatedToCollectiveIds },
                { HostCollectiveId: options.relatedToCollectiveIds },
                { ParentCollectiveId: options.relatedToCollectiveIds },
              ],
            }
          : null),
      },
    });
  }

  public mapModelInstanceToDocument(
    instance: InstanceType<typeof models.Collective>,
  ): Record<keyof (typeof this.mappings)['properties'], unknown> {
    return {
      id: instance.id,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
      slug: instance.slug,
      name: instance.name,
      type: instance.type,
      tags: instance.tags,
      legalName: instance.legalName,
      countryISO: instance.countryISO,
      description: instance.description,
      longDescription: stripHTMLOrEmpty(instance.longDescription),
      website: instance.website,
      isActive: instance.isActive,
      isHostAccount: instance.isHostAccount,
      deactivatedAt: instance.deactivatedAt,
      HostCollectiveId: !instance.isActive ? null : instance.HostCollectiveId,
      ParentCollectiveId: instance.ParentCollectiveId,
    };
  }

  public getIndexPermissions(adminOfAccountIds: number[]) {
    /* eslint-disable camelcase */
    if (!adminOfAccountIds.length) {
      return {
        default: 'PUBLIC' as const,
        fields: {
          legalName: 'FORBIDDEN' as const,
        },
      };
    }

    return {
      default: 'PUBLIC' as const,
      fields: {
        legalName: {
          bool: {
            minimum_should_match: 1,
            should: [
              { terms: { HostCollectiveId: adminOfAccountIds } },
              { terms: { ParentCollectiveId: adminOfAccountIds } },
              { terms: { id: adminOfAccountIds } },
            ],
          },
        },
      },
    };
    /* eslint-enable camelcase */
  }
}
