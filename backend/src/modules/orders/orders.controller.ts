import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { ChatService } from '../chat/chat.service.js';
import {
  cancelOrderSchema,
  createOrderSchema,
  feedSchema,
  finishSchema,
  jobsSchema,
  listOrdersSchema,
} from './orders.schemas.js';
import { OrdersService } from './orders.service.js';

const messageSchema = z
  .object({
    text: z.string().trim().min(1).max(2000).optional(),
    photo_key: z.string().max(300).optional(),
  })
  .refine((value) => Boolean(value.text) || Boolean(value.photo_key));
const messagesQuery = z.object({ before: z.uuid().optional() });

const uuid = new ParseUUIDPipe();

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly chat: ChatService,
  ) {}

  @Post()
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(createOrderSchema)) body: z.output<typeof createOrderSchema>,
  ) {
    return this.orders.create(auth.userId, body);
  }

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(listOrdersSchema)) query: z.output<typeof listOrdersSchema>,
  ) {
    return this.orders.listForCustomer(auth.userId, query.scope);
  }

  @Get(':id')
  get(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.orders.get(auth.userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(cancelOrderSchema)) body: z.output<typeof cancelOrderSchema>,
  ) {
    return this.orders.cancel(auth.userId, id, body);
  }

  // Executor actions.

  @Get(':id/accept-preview')
  acceptPreview(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.orders.acceptPreview(auth.userId, id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.orders.accept(auth.userId, id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  decline(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.orders.decline(auth.userId, id);
  }

  @Post(':id/depart')
  @HttpCode(HttpStatus.OK)
  depart(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.orders.step(auth.userId, id, 'DEPART');
  }

  @Post(':id/arrive')
  @HttpCode(HttpStatus.OK)
  arrive(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.orders.step(auth.userId, id, 'ARRIVE');
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  start(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.orders.step(auth.userId, id, 'START');
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.OK)
  finish(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(finishSchema)) body: z.output<typeof finishSchema>,
  ) {
    return this.orders.step(auth.userId, id, 'FINISH', body.photo_keys);
  }

  // Chat (BY4).

  @Get(':id/messages')
  messages(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Query(new ZodPipe(messagesQuery)) query: z.output<typeof messagesQuery>,
  ) {
    return this.chat.list(auth.userId, id, query.before);
  }

  @Post(':id/messages')
  send(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(messageSchema)) body: z.output<typeof messageSchema>,
  ) {
    return this.chat.send(auth.userId, id, body);
  }

  @Post(':id/messages/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  read(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.chat.markRead(auth.userId, id);
  }
}

@Controller()
export class FeedController {
  constructor(private readonly orders: OrdersService) {}

  /** BJ1 "Yangi". */
  @Get('feed')
  feed(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(feedSchema)) query: z.output<typeof feedSchema>,
  ) {
    return this.orders.feed(auth.userId, query);
  }

  /** BJ1 "Mening ishlarim" / "Tarix". */
  @Get('me/jobs')
  jobs(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(jobsSchema)) query: z.output<typeof jobsSchema>,
  ) {
    return this.orders.listForExecutor(auth.userId, query.scope);
  }
}
