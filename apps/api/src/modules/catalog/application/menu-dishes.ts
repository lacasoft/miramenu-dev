import { Injectable } from '@nestjs/common';
import { PublishedMenuService } from './published-menu.service';

/**
 * Contract "Confirmar que un platillo está en una sucursal" (design): a dish is in a
 * branch when it is on the branch's latest published menu. Hidden dishes are left out
 * of that menu, so they are not; unavailable ones are. Read through the menu's cache.
 */
@Injectable()
export class MenuDishes {
  constructor(private readonly menus: PublishedMenuService) {}

  /** Ids of the dishes on the branch's published menu; empty before its first publication. */
  async dishIdsOf(branchId: string): Promise<ReadonlySet<string>> {
    const menu = await this.menus.find(branchId);
    return new Set(
      (menu?.categories ?? []).flatMap((category) =>
        category.dishes.map((dish) => dish.id),
      ),
    );
  }

  async isOnMenu(branchId: string, dishId: string): Promise<boolean> {
    return (await this.dishIdsOf(branchId)).has(dishId);
  }

  /** The names of the dishes on the branch's published menu, by id: what diners read. */
  async namesOf(branchId: string): Promise<ReadonlyMap<string, string>> {
    const menu = await this.menus.find(branchId);
    return new Map(
      (menu?.categories ?? []).flatMap((category) =>
        category.dishes.map((dish) => [dish.id, dish.name] as const),
      ),
    );
  }
}
