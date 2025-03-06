import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ArrayPipesModule } from 'src/pipes/array/array-pipes.module';
import { FeedSkeletonComponent } from './feed-skeleton.component';

@NgModule({
  imports: [
    CommonModule,
    ArrayPipesModule
  ],
  exports: [
    FeedSkeletonComponent
  ],
  declarations: [
    FeedSkeletonComponent
  ]
})
export class FeedSkeletonModule {

}
