import { omit } from 'lodash';
import { Op } from 'sequelize';

import models from '../../../models';
import { stripHTMLOrEmpty } from '../../sanitize-html';
import { ElasticSearchIndexName } from '../constants';

import { ElasticSearchModelAdapter, FindEntriesToIndexOptions } from './ElasticSearchModelAdapter';

export class ElasticSearchUpdatesAdapter implements ElasticSearchModelAdapter {
  public readonly index = ElasticSearchIndexName.UPDATES;
  public readonly mappings = {
    properties: {
      id: { type: 'keyword' },
      createdAt: { type: 'date' },
      updatedAt: { type: 'date' },
      html: { type: 'text' },
      title: { type: 'text' },
      slug: { type: 'keyword' },
      isPrivate: { type: 'boolean' },
      // Relationships
      CollectiveId: { type: 'keyword' },
      FromCollectiveId: { type: 'keyword' },
      CreatedByUserId: { type: 'keyword' },
      // Special fields
      ParentCollectiveId: { type: 'keyword' },
      HostCollectiveId: { type: 'keyword' },
    },
  } as const;

  public getModel() {
    return models.Update;
  }

  public findEntriesToIndex(options: FindEntriesToIndexOptions = {}) {
    return models.Update.findAll({
      attributes: omit(Object.keys(this.mappings.properties), ['HostCollectiveId', 'ParentCollectiveId']),
      order: [['id', 'DESC']],
      limit: options.limit,
      offset: options.offset,
      where: {
        ...(options.fromDate ? { updatedAt: options.fromDate } : null),
        ...(options.maxId ? { id: { [Op.lte]: options.maxId } } : null),
        ...(options.ids?.length ? { id: options.ids } : null),
        ...(options.relatedToCollectiveIds?.length
          ? {
              [Op.or]: [
                { CollectiveId: options.relatedToCollectiveIds },
                { FromCollectiveId: options.relatedToCollectiveIds },
              ],
            }
          : null),
      },
      include: [
        {
          association: 'collective',
          required: true,
          attributes: ['isActive', 'HostCollectiveId', 'ParentCollectiveId'],
        },
      ],
    });
  }

  public mapModelInstanceToDocument(
    instance: InstanceType<typeof models.Update>,
  ): Record<keyof (typeof this.mappings)['properties'], unknown> {
    return {
      id: instance.id,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
      isPrivate: instance.isPrivate,
      slug: instance.slug,
      html: stripHTMLOrEmpty(instance.html),
      title: instance.title,
      CollectiveId: instance.CollectiveId,
      FromCollectiveId: instance.FromCollectiveId,
      CreatedByUserId: instance.CreatedByUserId,
      HostCollectiveId: !instance.collective.isActive ? null : instance.collective.HostCollectiveId,
      ParentCollectiveId: instance.collective.ParentCollectiveId,
    };
  }

  public getIndexPermissions(adminOfAccountIds: number[]) {
    /* eslint-disable camelcase */
    return {
      default: {
        bool: {
          minimum_should_match: 1,
          should: [
            { term: { isPrivate: false } },
            { terms: { HostCollectiveId: adminOfAccountIds } },
            { terms: { CollectiveId: adminOfAccountIds } },
            { terms: { ParentCollectiveId: adminOfAccountIds } },
          ],
        },
      },
    };
    /* eslint-enable camelcase */
  }
}
