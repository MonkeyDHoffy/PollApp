import { Routes } from '@angular/router';
import { HomeComponent } from './app/shared/pages/home/home';
import { SurveyDetailComponent } from './app/shared/pages/survey-detail/survey-detail';

export const routes: Routes = [
  {
    path: '',
    component: HomeComponent,
  },
  {
    path: 'survey/:id',
    component: SurveyDetailComponent,
  },
];
