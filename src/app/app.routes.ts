/** Top-level route definitions for the application. */
import { Routes } from '@angular/router';
import { HomeComponent } from './app/shared/pages/home/home';
import { SurveyDetailComponent } from './app/shared/pages/survey-detail/survey-detail';
import { ImpressumComponent } from './app/shared/pages/impressum/impressum';
import { DatenschutzComponent } from './app/shared/pages/datenschutz/datenschutz';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'survey/:id', component: SurveyDetailComponent },
  { path: 'join/:token', component: SurveyDetailComponent },
  { path: 'impressum', component: ImpressumComponent },
  { path: 'datenschutz', component: DatenschutzComponent },
  { path: '**', redirectTo: '' },
];
